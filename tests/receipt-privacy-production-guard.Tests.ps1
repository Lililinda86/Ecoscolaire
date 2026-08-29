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
  throw "Guard source has PowerShell parse errors: $($parseErrors -join '; ')"
}

$guardFunctions = @(
  'Get-RpFixtureStringField',
  'Test-RpFixtureBooleanFieldTrue',
  'Get-RpFixtureManifestEntry',
  'Assert-RpFixtureDocument'
)
foreach ($functionName in $guardFunctions) {
  $definition = @($scriptAst.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
      $node.Name -ceq $functionName
  }, $true))
  if ($definition.Count -ne 1) { throw "Expected exactly one $functionName definition." }
  Invoke-Expression $definition[0].Extent.Text
}

$fixtureSchoolId = 'receipt-fixture-test'
$crossSchoolId = 'receipt-fixture-test-cross'
$activeTestRunId = 'receipt-test-run'
$studentId = 'student-fixture-a'
$receiptId = 'receipt-fixture-a'
$unmanifestedStudentReceiptId = 'receipt-fixture-unmanifested-student'
$userUid = 'fixture-user-uid'

$manifest = [ordered]@{
  schools = [ordered]@{
    $fixtureSchoolId = @{ schoolId = $fixtureSchoolId }
    $crossSchoolId = @{ schoolId = $crossSchoolId }
    'wrong-root-school' = @{ schoolId = 'wrong-root-school' }
    'italo-gsb' = @{ schoolId = 'italo-gsb' }
  }
  users = [ordered]@{
    $userUid = @{ schoolId = $fixtureSchoolId }
  }
  students = [ordered]@{
    $studentId = @{ schoolId = $fixtureSchoolId }
  }
  receipts = [ordered]@{
    $receiptId = @{ schoolId = $fixtureSchoolId; studentId = $studentId }
    $unmanifestedStudentReceiptId = @{ schoolId = $fixtureSchoolId; studentId = 'student-not-in-manifest' }
  }
}

function New-TestString([string]$value) { return @{ stringValue = $value } }
function New-TestBool([bool]$value) { return @{ booleanValue = $value } }

function Invoke-GuardCase(
  [string]$label,
  [ValidateSet('ALLOW', 'DENY')][string]$expected,
  [string]$collection,
  [string]$documentId,
  [System.Collections.IDictionary]$fields
) {
  $actual = 'ALLOW'
  try {
    Assert-RpFixtureDocument $collection $documentId $fields $manifest `
      $fixtureSchoolId $crossSchoolId $activeTestRunId
  } catch {
    $actual = 'DENY'
  }
  if ($actual -cne $expected) { throw "$label expected $expected but got $actual." }
  Write-Output "PASS: $label => $actual"
}

$rootFields = @{
  id = New-TestString $fixtureSchoolId
  testFixture = New-TestBool $true
  testRunId = New-TestString $activeTestRunId
}
Invoke-GuardCase 'root school without schoolId' 'ALLOW' 'schools' $fixtureSchoolId $rootFields

Invoke-GuardCase 'root school wrong id' 'DENY' 'schools' 'wrong-root-school' @{
  id = New-TestString 'wrong-root-school'
  testFixture = New-TestBool $true
  testRunId = New-TestString $activeTestRunId
}
Invoke-GuardCase 'root school id italo-gsb' 'DENY' 'schools' 'italo-gsb' @{
  id = New-TestString 'italo-gsb'
  testFixture = New-TestBool $true
  testRunId = New-TestString $activeTestRunId
}

$validChildFields = @{
  id = New-TestString $studentId
  schoolId = New-TestString $fixtureSchoolId
  testFixture = New-TestBool $true
  testRunId = New-TestString $activeTestRunId
}
Invoke-GuardCase 'child correct schoolId' 'ALLOW' 'students' $studentId $validChildFields
Invoke-GuardCase 'child missing schoolId' 'DENY' 'students' $studentId @{
  id = New-TestString $studentId
  testFixture = New-TestBool $true
  testRunId = New-TestString $activeTestRunId
}
Invoke-GuardCase 'child wrong schoolId' 'DENY' 'students' $studentId @{
  id = New-TestString $studentId
  schoolId = New-TestString $crossSchoolId
  testFixture = New-TestBool $true
  testRunId = New-TestString $activeTestRunId
}
Invoke-GuardCase 'missing testFixture' 'DENY' 'students' $studentId @{
  id = New-TestString $studentId
  schoolId = New-TestString $fixtureSchoolId
  testRunId = New-TestString $activeTestRunId
}
Invoke-GuardCase 'wrong testRunId' 'DENY' 'students' $studentId @{
  id = New-TestString $studentId
  schoolId = New-TestString $fixtureSchoolId
  testFixture = New-TestBool $true
  testRunId = New-TestString 'wrong-test-run'
}
Invoke-GuardCase 'receipt student not manifested' 'DENY' 'receipts' $unmanifestedStudentReceiptId @{
  id = New-TestString $unmanifestedStudentReceiptId
  schoolId = New-TestString $fixtureSchoolId
  studentId = New-TestString 'student-not-in-manifest'
  testFixture = New-TestBool $true
  testRunId = New-TestString $activeTestRunId
}

Invoke-GuardCase 'receipt manifested student same school' 'ALLOW' 'receipts' $receiptId @{
  id = New-TestString $receiptId
  schoolId = New-TestString $fixtureSchoolId
  studentId = New-TestString $studentId
  testFixture = New-TestBool $true
  testRunId = New-TestString $activeTestRunId
}
Invoke-GuardCase 'resource outside allowlist' 'DENY' 'audit_logs' 'audit-fixture-a' @{
  schoolId = New-TestString $fixtureSchoolId
  testFixture = New-TestBool $true
  testRunId = New-TestString $activeTestRunId
}
Invoke-GuardCase 'unmanifested user UID' 'DENY' 'users' 'unknown-user-uid' @{
  uid = New-TestString 'unknown-user-uid'
  schoolId = New-TestString $fixtureSchoolId
  testFixture = New-TestBool $true
  testRunId = New-TestString $activeTestRunId
}
Invoke-GuardCase 'manifested user exact ownership' 'ALLOW' 'users' $userUid @{
  uid = New-TestString $userUid
  schoolId = New-TestString $fixtureSchoolId
  testFixture = New-TestBool $true
  testRunId = New-TestString $activeTestRunId
}

Write-Output 'Receipt privacy production fixture guard tests passed.'
