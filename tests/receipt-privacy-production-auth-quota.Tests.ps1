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
  throw "Auth REST source has PowerShell parse errors: $($parseErrors -join '; ')"
}

$authFunctions = @(
  'New-RpFirebaseClientAuthHeaders',
  'Assert-RpFirebaseClientAuthRequest',
  'Protect-RpAuthErrorText',
  'New-RpSanitizedAuthHttpException',
  'Invoke-RpAuthRestRequest'
)
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

$apiKey = 'fixture-api-key'
$headers = New-RpFirebaseClientAuthHeaders
Assert-Equal 'Firebase Client REST keeps Content-Type' 'application/json' $headers['Content-Type']
Assert-Equal 'Firebase Client REST omits quota project' $false $headers.Contains('x-goog-user-project')
Assert-Equal 'Firebase Client REST omits Authorization Bearer' $false $headers.Contains('Authorization')

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

$authCases = @(
  @{ Operation = 'accounts:signUp'; Uri = "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$apiKey" },
  @{ Operation = 'accounts:lookup'; Uri = "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=$apiKey" },
  @{ Operation = 'accounts:delete'; Uri = "https://identitytoolkit.googleapis.com/v1/accounts:delete?key=$apiKey" }
)
foreach ($case in $authCases) {
  Invoke-RpAuthRestRequest 'Post' $case.Uri $headers '{}' $case.Operation $apiKey | Out-Null
}
Assert-Equal 'all Firebase Client Auth requests were issued' 3 $script:capturedRequests.Count
foreach ($request in $script:capturedRequests) {
  Assert-Equal "quota header absent on $($request.Uri.Split('?')[0])" $false $request.Headers.Contains('x-goog-user-project')
  Assert-Equal "Bearer absent on $($request.Uri.Split('?')[0])" $false $request.Headers.Contains('Authorization')
  Assert-Equal "API key present on $($request.Uri.Split('?')[0])" $apiKey ([System.Web.HttpUtility]::ParseQueryString(([uri]$request.Uri).Query)['key'])
}

$beforeDenied = $script:capturedRequests.Count
foreach ($deniedCase in @(
  @{ Label = 'missing expected API key'; Uri = $authCases[0].Uri; Headers = $headers; ExpectedKey = '' },
  @{ Label = 'missing request API key'; Uri = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp'; Headers = $headers; ExpectedKey = $apiKey },
  @{ Label = 'wrong request API key'; Uri = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=wrong'; Headers = $headers; ExpectedKey = $apiKey },
  @{ Label = 'Bearer header'; Uri = $authCases[0].Uri; Headers = @{ 'Content-Type' = 'application/json'; Authorization = 'Bearer secret-token' }; ExpectedKey = $apiKey },
  @{ Label = 'quota project header'; Uri = $authCases[0].Uri; Headers = @{ 'Content-Type' = 'application/json'; 'x-goog-user-project' = 'ecoscolaire-c5861' }; ExpectedKey = $apiKey }
)) {
  $denied = $false
  try {
    Invoke-RpAuthRestRequest 'Post' $deniedCase.Uri $deniedCase.Headers '{}' 'accounts:signUp' $deniedCase.ExpectedKey | Out-Null
  } catch { $denied = $true }
  Assert-Equal "$($deniedCase.Label) fails closed" $true $denied
}
Assert-Equal 'fail-closed requests stop before transport' $beforeDenied $script:capturedRequests.Count

$script:mockStatusCode = 403
$script:mockContent = @'
{"error":{"status":"PERMISSION_DENIED","message":"denied fixture-api-key secret-password secret-id-token real.user@example.com","details":[{"reason":"USER_PROJECT_DENIED","token":"must-not-survive"}]},"token":"must-not-survive"}
'@
$sensitiveBody = @{
  email = 'real.user@example.com'
  password = 'secret-password'
  idToken = 'secret-id-token'
} | ConvertTo-Json -Compress
$httpError = $null
try {
  Invoke-RpAuthRestRequest 'Post' $authCases[1].Uri $headers $sensitiveBody 'accounts:lookup' $apiKey | Out-Null
} catch { $httpError = $_.Exception.Message }
Assert-Equal 'HTTP status retained' $true $httpError.Contains('"status":403')
Assert-Equal 'Google error.status retained' $true $httpError.Contains('"status":"PERMISSION_DENIED"')
Assert-Equal 'Google error.reason retained' $true $httpError.Contains('"reason":"USER_PROJECT_DENIED"')
Assert-Equal 'Google error.message retained sanitized' $true $httpError.Contains('"message":"denied [REDACTED] [REDACTED] [REDACTED] [REDACTED]"')
foreach ($secret in @($apiKey, 'secret-password', 'secret-id-token', 'real.user@example.com', 'must-not-survive')) {
  Assert-Equal "HTTP error redacts $secret" $false $httpError.Contains($secret)
}
Assert-Equal 'unapproved error field omitted' $false $httpError.Contains('"token"')

$script:mockTransportError = 'transport exposed secret-token real.user@example.com'
$transportError = $null
try {
  Invoke-RpAuthRestRequest 'Post' $authCases[1].Uri $headers '{}' 'accounts:lookup' $apiKey | Out-Null
} catch { $transportError = $_.Exception.Message }
Assert-Equal 'transport error is sanitized' 'Auth REST accounts:lookup transport failure.' $transportError
Assert-Equal 'transport error does not leak token' $false $transportError.Contains('secret-token')
Assert-Equal 'transport error does not leak email' $false $transportError.Contains('real.user@example.com')

$source = Get-Content -LiteralPath $scriptPath -Raw
Assert-Equal 'OAuth Firestore Authorization behavior retained' $true $source.Contains('$rpOAuthHeaders = @{ Authorization = "Bearer $rpOAuthToken"; ''Content-Type'' = ''application/json'' }')
Assert-Equal 'Auth-specific OAuth headers removed' $false $source.Contains('$rpAuthOAuthHeaders')

$authCallers = @(
  @{ Name = 'New-RpAuthUser'; Operation = 'accounts:signUp'; RequiredBodyField = 'password' },
  @{ Name = 'Remove-RpAuthUser'; Operation = 'accounts:delete'; RequiredBodyField = 'idToken' },
  @{ Name = 'Get-RpAuthResidualCount'; Operation = 'accounts:lookup'; RequiredBodyField = 'idToken' }
)
foreach ($authCaller in $authCallers) {
  $callerName = $authCaller.Name
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
  Assert-Equal "$callerName routes Auth through the Firebase Client guard" 1 $wrappedCalls.Count
  Assert-Equal "$callerName has no quota header" $false $caller[0].Extent.Text.Contains('x-goog-user-project')
  Assert-Equal "$callerName has no Bearer header" $false $caller[0].Extent.Text.Contains('Authorization')
  Assert-Equal "$callerName uses the Firebase Client endpoint" $true $caller[0].Extent.Text.Contains($authCaller.Operation)
  Assert-Equal "$callerName includes the API key query" $true $caller[0].Extent.Text.Contains('?key=')
  Assert-Equal "$callerName keeps its required request body" $true $caller[0].Extent.Text.Contains($authCaller.RequiredBodyField)
}

Write-Output 'Receipt privacy production Firebase Client Auth tests passed.'
