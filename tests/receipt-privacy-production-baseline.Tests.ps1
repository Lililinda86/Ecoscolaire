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
  throw "Baseline source has PowerShell parse errors: $($parseErrors -join '; ')"
}

$baselineFunctions = @(
  'Get-RpObjectProperty',
  'Get-RpFirestoreStringField',
  'Test-RpFirestoreBooleanFieldTrue',
  'Get-RpDocumentId',
  'Get-TechnicalSchoolId'
)
foreach ($functionName in $baselineFunctions) {
  $definition = @($scriptAst.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
      $node.Name -ceq $functionName
  }, $true))
  if ($definition.Count -ne 1) { throw "Expected exactly one $functionName definition." }
  Invoke-Expression $definition[0].Extent.Text
}

function New-BaselineDocument(
  [string]$collection,
  [string]$documentId,
  [System.Collections.IDictionary]$fields
) {
  return [pscustomobject]@{
    name = "projects/test/databases/(default)/documents/$collection/$documentId"
    fields = [pscustomobject]$fields
    updateTime = '2026-08-29T00:00:00Z'
  }
}

function New-TestString([string]$value) { return [pscustomobject]@{ stringValue = $value } }

function Assert-Equal([string]$label, [object]$expected, [object]$actual) {
  if ($null -eq $expected -and $null -eq $actual) {
    Write-Output "PASS: $label"
    return
  }
  if ($actual -cne $expected) { throw "$label expected '$expected' but got '$actual'." }
  Write-Output "PASS: $label"
}

$rootWithoutSchoolId = New-BaselineDocument 'schools' 'root-without-school-id' @{}
Assert-Equal 'real/root school without schoolId' 'root-without-school-id' `
  (Get-TechnicalSchoolId $rootWithoutSchoolId 'schools')

$rootMatchingId = New-BaselineDocument 'schools' 'root-matching-id' @{
  id = New-TestString 'root-matching-id'
}
Assert-Equal 'root school fields.id equals documentId' 'root-matching-id' `
  (Get-TechnicalSchoolId $rootMatchingId 'schools')

$mismatchDenied = $false
try {
  $rootMismatch = New-BaselineDocument 'schools' 'root-document-id' @{
    id = New-TestString 'different-field-id'
  }
  Get-TechnicalSchoolId $rootMismatch 'schools' | Out-Null
} catch {
  $mismatchDenied = $true
}
Assert-Equal 'root school fields.id mismatch fails closed' $true $mismatchDenied

$malformedIdDenied = $false
try {
  $rootMalformedId = New-BaselineDocument 'schools' 'root-malformed-id' @{
    id = [pscustomobject]@{ booleanValue = $true }
  }
  Get-TechnicalSchoolId $rootMalformedId 'schools' | Out-Null
} catch {
  $malformedIdDenied = $true
}
Assert-Equal 'root school malformed fields.id fails closed' $true $malformedIdDenied

$childWithSchoolId = New-BaselineDocument 'receipts' 'receipt-with-school' @{
  schoolId = New-TestString 'fixture-school'
}
Assert-Equal 'child with schoolId' 'fixture-school' `
  (Get-TechnicalSchoolId $childWithSchoolId 'receipts')

$childWithoutSchoolId = New-BaselineDocument 'receipts' 'receipt-without-school' @{}
Assert-Equal 'child without schoolId is safely non-comparable' $null `
  (Get-TechnicalSchoolId $childWithoutSchoolId 'receipts')
Assert-Equal 'missing optional string field is safe' $null `
  (Get-RpFirestoreStringField $childWithoutSchoolId.fields 'testRunId')
Assert-Equal 'missing optional boolean field is safe' $false `
  (Test-RpFirestoreBooleanFieldTrue $childWithoutSchoolId.fields 'testFixture')

$italoDocument = New-BaselineDocument 'schools' 'italo-gsb' @{
  id = New-TestString 'italo-gsb'
}
$italoBefore = $italoDocument | ConvertTo-Json -Depth 8 -Compress
Assert-Equal 'italo-gsb root read uses technical identity' 'italo-gsb' `
  (Get-TechnicalSchoolId $italoDocument 'schools')
$italoAfter = $italoDocument | ConvertTo-Json -Depth 8 -Compress
Assert-Equal 'no accidental italo-gsb mutation' $italoBefore $italoAfter

$forbiddenCommands = @(
  foreach ($definition in @($scriptAst.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
      $node.Name -in $baselineFunctions
  }, $true))) {
    $definition.Body.FindAll({
      param($node)
      $node -is [System.Management.Automation.Language.CommandAst] -and
        $node.GetCommandName() -in @(
          'New-RpDocument',
          'Invoke-RestMethod',
          'Invoke-WebRequest',
          'Remove-RpDocument'
        )
    }, $true)
  }
)
Assert-Equal 'no fixture creation during baseline helper tests' 0 $forbiddenCommands.Count

Write-Output 'Receipt privacy production baseline tests passed.'
