$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$scriptPath = (Resolve-Path (Join-Path $PSScriptRoot '..\receipt-privacy-production-live.ps1')).Path
$tokens = $null
$parseErrors = $null
$scriptAst = [System.Management.Automation.Language.Parser]::ParseFile(
  $scriptPath,
  [ref]$tokens,
  [ref]$parseErrors
)
if ($parseErrors.Count -ne 0) {
  throw "Auth quota source has PowerShell parse errors: $($parseErrors -join '; ')"
}

$rpExpectedQuotaProject = 'ecoscolaire-c5861'
$authFunctions = @('New-RpAuthHeaders', 'Assert-RpAuthHeaders', 'Invoke-RpAuthRestRequest')
foreach ($functionName in $authFunctions) {
  $definition = @($scriptAst.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
      $node.Name -ceq $functionName
  }, $true))
  if ($definition.Count -ne 1) { throw "Expected exactly one $functionName definition." }
  Invoke-Expression $definition[0].Extent.Text
}

function Assert-Equal([string]$label, [object]$expected, [object]$actual) {
  if ($actual -cne $expected) { throw "$label expected '$expected' but got '$actual'." }
  Write-Output "PASS: $label"
}

$missingDenied = $false
try { New-RpAuthHeaders '' 'secret-token' | Out-Null } catch { $missingDenied = $true }
Assert-Equal 'missing quota project is denied' $true $missingDenied

$wrongDenied = $false
try { New-RpAuthHeaders 'wrong-project' 'secret-token' | Out-Null } catch { $wrongDenied = $true }
Assert-Equal 'wrong quota project is denied' $true $wrongDenied

$exactHeaders = New-RpAuthHeaders 'ecoscolaire-c5861' 'secret-token'
Assert-Equal 'exact quota project is allowed' 'ecoscolaire-c5861' $exactHeaders['x-goog-user-project']
Assert-Equal 'OAuth authorization is retained' 'Bearer secret-token' $exactHeaders['Authorization']

$script:capturedRequests = [System.Collections.Generic.List[object]]::new()
$script:mockStatusCode = 200
$script:mockContent = '{"users":[]}'
$script:mockTransportError = $null
function Invoke-WebRequest {
  param(
    [switch]$UseBasicParsing,
    [switch]$SkipHttpErrorCheck,
    [string]$Method,
    [string]$Uri,
    [System.Collections.IDictionary]$Headers,
    [string]$Body
  )
  $script:capturedRequests.Add([pscustomobject]@{
    Method = $Method
    Uri = $Uri
    Headers = $Headers
    Body = $Body
  })
  if ($null -ne $script:mockTransportError) { throw $script:mockTransportError }
  return [pscustomobject]@{ StatusCode = $script:mockStatusCode; Content = $script:mockContent }
}

$authUris = @(
  'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=redacted',
  'https://identitytoolkit.googleapis.com/v1/projects/ecoscolaire-c5861/accounts:delete',
  'https://identitytoolkit.googleapis.com/v1/projects/ecoscolaire-c5861/accounts:lookup'
)
foreach ($uri in $authUris) {
  Invoke-RpAuthRestRequest 'Post' $uri $exactHeaders '{}' 'test-operation' | Out-Null
}
Assert-Equal 'all Auth requests were issued' 3 $script:capturedRequests.Count
foreach ($request in $script:capturedRequests) {
  Assert-Equal "quota header present on $($request.Uri.Split('?')[0])" 'ecoscolaire-c5861' $request.Headers['x-goog-user-project']
}

$missingHeaderDenied = $false
try {
  Invoke-RpAuthRestRequest 'Post' $authUris[2] @{ Authorization = 'Bearer secret-token' } '{}' 'test-operation' | Out-Null
} catch { $missingHeaderDenied = $true }
Assert-Equal 'request without quota header stops before transport' $true $missingHeaderDenied
Assert-Equal 'denied request was not issued' 3 $script:capturedRequests.Count

$wrongHeaderDenied = $false
try {
  Invoke-RpAuthRestRequest 'Post' $authUris[2] @{
    Authorization = 'Bearer secret-token'
    'x-goog-user-project' = 'wrong-project'
  } '{}' 'test-operation' | Out-Null
} catch { $wrongHeaderDenied = $true }
Assert-Equal 'request with wrong quota header stops before transport' $true $wrongHeaderDenied
Assert-Equal 'wrong-project request was not issued' 3 $script:capturedRequests.Count

$script:mockStatusCode = 403
$script:mockContent = '{"error":{"message":"secret-token"}}'
$httpError = $null
try {
  Invoke-RpAuthRestRequest 'Post' $authUris[2] $exactHeaders '{}' 'accounts:lookup' | Out-Null
} catch { $httpError = $_.Exception.Message }
Assert-Equal 'HTTP non-2xx stops Auth verification' 'Auth REST accounts:lookup failed with HTTP 403.' $httpError
Assert-Equal 'HTTP error does not leak token' $false $httpError.Contains('secret-token')

$script:mockTransportError = 'transport exposed secret-token'
$transportError = $null
try {
  Invoke-RpAuthRestRequest 'Post' $authUris[2] $exactHeaders '{}' 'accounts:lookup' | Out-Null
} catch { $transportError = $_.Exception.Message }
Assert-Equal 'transport error is sanitized' 'Auth REST accounts:lookup transport failure.' $transportError
Assert-Equal 'transport error does not leak token' $false $transportError.Contains('secret-token')

$authCallerNames = @('New-RpAuthUser', 'Remove-RpAuthUser', 'Get-RpAuthResidualCount')
foreach ($callerName in $authCallerNames) {
  $caller = @($scriptAst.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
      $node.Name -ceq $callerName
  }, $true))
  if ($caller.Count -ne 1) { throw "Expected exactly one $callerName definition." }
  $wrappedCalls = @($caller[0].Body.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.CommandAst] -and
      $node.GetCommandName() -ceq 'Invoke-RpAuthRestRequest'
  }, $true))
  Assert-Equal "$callerName routes its Auth request through quota guard" 1 $wrappedCalls.Count
}

Write-Output 'Receipt privacy production Auth quota tests passed.'
