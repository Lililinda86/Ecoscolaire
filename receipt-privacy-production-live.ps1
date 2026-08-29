$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$rpProject = 'ecoscolaire-c5861'
$rpExpectedSha = '219c7febf3c43a4fa697b838d27b783cc356a376'
$rpRunId = 'receipt-' + (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss') + '-' + ([guid]::NewGuid().ToString('N').Substring(0, 8))
$rpSchoolId = "transport-release-production-receipt-$rpRunId"
$rpCrossSchoolId = "$rpSchoolId-cross"
$rpDatabaseBase = "https://firestore.googleapis.com/v1/projects/$rpProject/databases/(default)/documents"
$rpAuthBase = 'https://identitytoolkit.googleapis.com/v1'
$rpOAuthToken = (gcloud auth print-access-token).Trim()
$rpOAuthHeaders = @{ Authorization = "Bearer $rpOAuthToken"; 'Content-Type' = 'application/json' }
$rpCreatedDocs = [System.Collections.Generic.List[object]]::new()
$rpCreatedUsers = [System.Collections.Generic.List[object]]::new()
$rpResults = [ordered]@{}
$rpFailure = $null
$rpBaselineCollections = @('schools', 'users', 'students', 'receipts', 'audit_logs')
$rpFixtureManifest = [ordered]@{
  schools = [ordered]@{}
  users = [ordered]@{}
  students = [ordered]@{}
  receipts = [ordered]@{}
}

function New-RpString([string]$value) { return @{ stringValue = $value } }
function New-RpBool([bool]$value) { return @{ booleanValue = $value } }
function New-RpInt([long]$value) { return @{ integerValue = [string]$value } }
function New-RpArray([object[]]$values) { return @{ arrayValue = @{ values = $values } } }

function Get-RpFixtureStringField([System.Collections.IDictionary]$fields, [string]$name) {
  if ($null -eq $fields -or -not $fields.Contains($name)) { return $null }
  $field = $fields[$name]
  if ($field -isnot [System.Collections.IDictionary] -or -not $field.Contains('stringValue')) { return $null }
  if ($field['stringValue'] -isnot [string]) { return $null }
  return [string]$field['stringValue']
}

function Test-RpFixtureBooleanFieldTrue([System.Collections.IDictionary]$fields, [string]$name) {
  if ($null -eq $fields -or -not $fields.Contains($name)) { return $false }
  $field = $fields[$name]
  if ($field -isnot [System.Collections.IDictionary] -or -not $field.Contains('booleanValue')) { return $false }
  return ($field['booleanValue'] -is [bool] -and $field['booleanValue'] -eq $true)
}

function Get-RpFixtureManifestEntry(
  [System.Collections.IDictionary]$manifest,
  [string]$collection,
  [string]$documentId
) {
  $manifestCollectionKey = @($manifest.Keys | Where-Object { [string]$_ -ceq $collection })
  if ($manifestCollectionKey.Count -ne 1) { return $null }
  $manifestCollection = $manifest[$manifestCollectionKey[0]]
  if ($manifestCollection -isnot [System.Collections.IDictionary]) { return $null }
  $manifestDocumentKey = @($manifestCollection.Keys | Where-Object { [string]$_ -ceq $documentId })
  if ($manifestDocumentKey.Count -ne 1) { return $null }
  return $manifestCollection[$manifestDocumentKey[0]]
}

function Assert-RpFixtureDocument(
  [string]$collection,
  [string]$documentId,
  [System.Collections.IDictionary]$fields,
  [System.Collections.IDictionary]$manifest,
  [string]$fixtureSchoolId,
  [string]$crossSchoolId,
  [string]$activeTestRunId
) {
  if ([string]::IsNullOrWhiteSpace($collection) -or [string]::IsNullOrWhiteSpace($documentId)) {
    throw 'Fixture collection and documentId are required.'
  }
  if ($documentId -match 'italo-gsb') { throw 'Forbidden real ITALO identifier in fixture documentId.' }

  $fieldId = Get-RpFixtureStringField $fields 'id'
  if ($null -ne $fieldId -and $fieldId -match 'italo-gsb') {
    throw 'Forbidden real ITALO identifier in fixture id field.'
  }
  if (-not (Test-RpFixtureBooleanFieldTrue $fields 'testFixture')) {
    throw 'Fixture testFixture marker must be exactly true.'
  }
  $testRunId = Get-RpFixtureStringField $fields 'testRunId'
  if ($null -eq $testRunId -or $testRunId -cne $activeTestRunId) {
    throw 'Fixture testRunId marker does not match the active test run.'
  }

  $manifestEntry = Get-RpFixtureManifestEntry $manifest $collection $documentId
  if ($null -eq $manifestEntry) { throw 'Fixture resource is outside the manifest allowlist.' }

  if ($collection -ceq 'schools') {
    if ($documentId -cne $fixtureSchoolId -and $documentId -cne $crossSchoolId) {
      throw 'Root school documentId is not an allowed fixture school.'
    }
    if ($null -eq $fieldId -or $fieldId -cne $documentId) {
      throw 'Root school id field must exactly match documentId.'
    }
    return
  }

  $schoolId = Get-RpFixtureStringField $fields 'schoolId'
  if ($null -eq $schoolId) { throw 'Fixture child resource is missing schoolId.' }
  if ($manifestEntry -isnot [System.Collections.IDictionary] -or -not $manifestEntry.Contains('schoolId')) {
    throw 'Fixture manifest entry is missing school ownership.'
  }
  $expectedSchoolId = [string]$manifestEntry['schoolId']
  if ($schoolId -cne $expectedSchoolId -or ($schoolId -cne $fixtureSchoolId -and $schoolId -cne $crossSchoolId)) {
    throw 'Fixture child resource has the wrong schoolId.'
  }

  if ($collection -ceq 'receipts') {
    $studentId = Get-RpFixtureStringField $fields 'studentId'
    if ($null -eq $studentId -or -not $manifestEntry.Contains('studentId') -or
      $studentId -cne [string]$manifestEntry['studentId']) {
      throw 'Receipt student is not manifested for this receipt.'
    }
    $studentEntry = Get-RpFixtureManifestEntry $manifest 'students' $studentId
    if ($studentEntry -isnot [System.Collections.IDictionary] -or -not $studentEntry.Contains('schoolId') -or
      [string]$studentEntry['schoolId'] -cne $schoolId) {
      throw 'Receipt student is not manifested in the same fixture school.'
    }
  }

  if ($collection -ceq 'users') {
    $uid = Get-RpFixtureStringField $fields 'uid'
    if ($null -eq $uid -or $uid -cne $documentId) {
      throw 'Fixture user UID must be manifested and exactly match documentId.'
    }
  }
}

function Get-RpPublicConfig {
  $base = 'https://ecoscolaire.vercel.app'
  $html = (Invoke-WebRequest -UseBasicParsing -Uri $base).Content
  $match = [regex]::Match($html, 'src="([^"]+\.js)"')
  if (-not $match.Success) { throw 'Production JavaScript bundle not found.' }
  $bundle = (Invoke-WebRequest -UseBasicParsing -Uri ($base + $match.Groups[1].Value)).Content
  $apiKey = [regex]::Match($bundle, 'apiKey:"([^"]+)"').Groups[1].Value
  $authDomain = [regex]::Match($bundle, 'authDomain:"([^"]+)"').Groups[1].Value
  $projectId = [regex]::Match($bundle, 'projectId:"([^"]+)"').Groups[1].Value
  if (-not $apiKey -or $projectId -ne $rpProject -or $authDomain -ne "$rpProject.firebaseapp.com") {
    throw 'Production Firebase public config mismatch.'
  }
  return @{ apiKey = $apiKey; authDomain = $authDomain; projectId = $projectId }
}

function New-RpDocument([string]$collection, [string]$id, [hashtable]$fields) {
  Assert-RpFixtureDocument $collection $id $fields $rpFixtureManifest $rpSchoolId $rpCrossSchoolId $rpRunId
  $uri = "$rpDatabaseBase/$collection`?documentId=$([uri]::EscapeDataString($id))"
  $body = @{ fields = $fields } | ConvertTo-Json -Depth 12 -Compress
  Invoke-RestMethod -Method Post -Uri $uri -Headers $rpOAuthHeaders -Body $body | Out-Null
  $rpCreatedDocs.Add([pscustomobject]@{ collection = $collection; id = $id })
}

function Remove-RpDocument([string]$collection, [string]$id) {
  $uri = "$rpDatabaseBase/$collection/$([uri]::EscapeDataString($id))"
  Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Method Delete -Uri $uri -Headers $rpOAuthHeaders | Out-Null
}

function Get-RpObjectProperty([object]$inputObject, [string]$name) {
  if ($null -eq $inputObject) { return $null }
  if ($inputObject -is [System.Collections.IDictionary]) {
    if (-not $inputObject.Contains($name)) { return $null }
    return $inputObject[$name]
  }
  $property = $inputObject.PSObject.Properties[$name]
  if ($null -eq $property) { return $null }
  return $property.Value
}

function Get-RpFirestoreStringField([object]$fields, [string]$name) {
  $field = Get-RpObjectProperty $fields $name
  $value = Get-RpObjectProperty $field 'stringValue'
  if ($value -isnot [string]) { return $null }
  return [string]$value
}

function Test-RpFirestoreBooleanFieldTrue([object]$fields, [string]$name) {
  $field = Get-RpObjectProperty $fields $name
  $value = Get-RpObjectProperty $field 'booleanValue'
  return ($value -is [bool] -and $value -eq $true)
}

function Get-RpDocumentId([object]$document) {
  $name = Get-RpObjectProperty $document 'name'
  if ($name -isnot [string] -or [string]::IsNullOrWhiteSpace($name)) { return $null }
  $documentId = [uri]::UnescapeDataString(($name -split '/')[-1])
  if ([string]::IsNullOrWhiteSpace($documentId)) { return $null }
  return $documentId
}

function Get-TechnicalSchoolId([object]$document, [string]$collection) {
  $fields = Get-RpObjectProperty $document 'fields'
  if ($collection -ceq 'schools') {
    $documentId = Get-RpDocumentId $document
    if ($null -eq $documentId) { return $null }
    $idField = Get-RpObjectProperty $fields 'id'
    $fieldId = Get-RpFirestoreStringField $fields 'id'
    if ($null -ne $idField -and
      ($null -eq $fieldId -or $fieldId -cne $documentId)) {
      throw 'Root school id field is invalid or does not match documentId.'
    }
    return $documentId
  }
  return Get-RpFirestoreStringField $fields 'schoolId'
}

function Get-RpCollection([string]$collection) {
  $rows = [System.Collections.Generic.List[object]]::new()
  $pageToken = $null
  do {
    $uri = "$rpDatabaseBase/$collection`?pageSize=1000"
    if ($pageToken) { $uri += "&pageToken=$([uri]::EscapeDataString($pageToken))" }
    $response = Invoke-RestMethod -Method Get -Uri $uri -Headers $rpOAuthHeaders
    foreach ($document in @(Get-RpObjectProperty $response 'documents')) {
      if ($null -eq $document) { continue }
      $fields = Get-RpObjectProperty $document 'fields'
      $id = Get-RpDocumentId $document
      $schoolId = Get-TechnicalSchoolId $document $collection
      $testRunId = Get-RpFirestoreStringField $fields 'testRunId'
      $testFixture = Test-RpFirestoreBooleanFieldTrue $fields 'testFixture'
      $updateTime = Get-RpObjectProperty $document 'updateTime'
      $rows.Add([pscustomobject]@{
        id = $id; updateTime = if ($null -eq $updateTime) { $null } else { [string]$updateTime }; schoolId = $schoolId
        testRunId = $testRunId; testFixture = $testFixture
      })
    }
    $nextPageToken = Get-RpObjectProperty $response 'nextPageToken'
    $pageToken = if ($nextPageToken -is [string] -and $nextPageToken) { [string]$nextPageToken } else { $null }
  } while ($pageToken)
  return @($rows)
}

function Get-RpBaseline {
  $baseline = [ordered]@{}
  foreach ($collection in $rpBaselineCollections) {
    $baseline[$collection] = @(Get-RpCollection $collection | Where-Object { -not $_.testFixture } |
      Sort-Object id | ForEach-Object {
        [ordered]@{ id = $_.id; updateTime = $_.updateTime; schoolId = $_.schoolId }
      })
  }
  return $baseline
}

function New-RpAuthUser([string]$role, [string]$schoolId, [string[]]$studentIds, [string]$apiKey) {
  $email = "$role-$rpRunId@example.invalid".ToLowerInvariant()
  $password = ([guid]::NewGuid().ToString('N') + '!Aa7')
  $signupBody = @{ email = $email; password = $password; returnSecureToken = $true } | ConvertTo-Json -Compress
  $signup = Invoke-RestMethod -Method Post -Uri "$rpAuthBase/accounts:signUp?key=$apiKey" -ContentType 'application/json' -Body $signupBody
  $user = [pscustomobject]@{ uid = [string]$signup.localId; email = $email; password = $password; idToken = [string]$signup.idToken }
  $rpCreatedUsers.Add($user)
  $rpFixtureManifest.users[$user.uid] = @{ schoolId = $schoolId }
  $studentValues = @($studentIds | ForEach-Object { New-RpString $_ })
  New-RpDocument 'users' $user.uid @{
    uid = New-RpString $user.uid
    email = New-RpString $email
    name = New-RpString "Receipt fixture $role"
    role = New-RpString $role
    schoolId = New-RpString $schoolId
    active = New-RpBool $true
    isActive = New-RpBool $true
    studentIds = New-RpArray $studentValues
    testFixture = New-RpBool $true
    testRunId = New-RpString $rpRunId
  }
  return $user
}

function Test-RpReceiptRead([string]$idToken, [string]$receiptId, [int]$expectedStatus, [string]$label) {
  $headers = @{ Authorization = "Bearer $idToken" }
  $response = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Method Get -Uri "$rpDatabaseBase/receipts/$receiptId" -Headers $headers
  $actual = [int]$response.StatusCode
  if ($actual -ne $expectedStatus) { throw "$label expected HTTP $expectedStatus, got $actual." }
  $rpResults[$label] = if ($expectedStatus -eq 200) { 'ALLOW' } else { 'DENY' }
}

function Remove-RpAuthUser([string]$uid) {
  $body = @{ localId = $uid } | ConvertTo-Json -Compress
  Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Method Post -Uri "$rpAuthBase/projects/$rpProject/accounts`:delete" -Headers $rpOAuthHeaders -Body $body | Out-Null
}

function Get-RpAuthResidualCount {
  if ($rpCreatedUsers.Count -eq 0) { return 0 }
  $body = @{ localId = @($rpCreatedUsers | ForEach-Object uid) } | ConvertTo-Json -Depth 4 -Compress
  $response = Invoke-RestMethod -Method Post -Uri "$rpAuthBase/projects/$rpProject/accounts`:lookup" -Headers $rpOAuthHeaders -Body $body
  return @($response.users).Count
}

$rpConfig = Get-RpPublicConfig
$rpBaselineAt = (Get-Date).ToUniversalTime().ToString('o')
$rpBaselineBefore = Get-RpBaseline

try {
  if ((git rev-parse origin/main).Trim() -ne $rpExpectedSha) { throw 'Main SHA changed before fixture creation.' }
  if ($rpSchoolId -eq 'italo-gsb' -or $rpCrossSchoolId -eq 'italo-gsb') { throw 'Forbidden real school.' }

  $studentA = "receipt-child-a-$rpRunId"
  $studentB = "receipt-child-b-$rpRunId"
  $studentCross = "receipt-child-cross-$rpRunId"
  $receiptA = "receipt-own-$rpRunId"
  $receiptB = "receipt-unrelated-$rpRunId"
  $receiptCross = "receipt-cross-$rpRunId"

  $rpFixtureManifest.schools[$rpSchoolId] = @{ schoolId = $rpSchoolId }
  $rpFixtureManifest.schools[$rpCrossSchoolId] = @{ schoolId = $rpCrossSchoolId }
  $rpFixtureManifest.students[$studentA] = @{ schoolId = $rpSchoolId }
  $rpFixtureManifest.students[$studentB] = @{ schoolId = $rpSchoolId }
  $rpFixtureManifest.students[$studentCross] = @{ schoolId = $rpCrossSchoolId }
  $rpFixtureManifest.receipts[$receiptA] = @{ schoolId = $rpSchoolId; studentId = $studentA }
  $rpFixtureManifest.receipts[$receiptB] = @{ schoolId = $rpSchoolId; studentId = $studentB }
  $rpFixtureManifest.receipts[$receiptCross] = @{ schoolId = $rpCrossSchoolId; studentId = $studentCross }

  New-RpDocument 'schools' $rpSchoolId @{
    id = New-RpString $rpSchoolId; name = New-RpString 'Receipt privacy isolated fixture'
    active = New-RpBool $true; testFixture = New-RpBool $true; testRunId = New-RpString $rpRunId
  }
  New-RpDocument 'schools' $rpCrossSchoolId @{
    id = New-RpString $rpCrossSchoolId; name = New-RpString 'Receipt privacy cross fixture'
    active = New-RpBool $true; testFixture = New-RpBool $true; testRunId = New-RpString $rpRunId
  }
  foreach ($student in @(
    @{ id = $studentA; school = $rpSchoolId }, @{ id = $studentB; school = $rpSchoolId },
    @{ id = $studentCross; school = $rpCrossSchoolId }
  )) {
    New-RpDocument 'students' $student.id @{
      id = New-RpString $student.id; schoolId = New-RpString $student.school
      name = New-RpString 'Receipt privacy fixture'; testFixture = New-RpBool $true; testRunId = New-RpString $rpRunId
    }
  }
  foreach ($receipt in @(
    @{ id = $receiptA; student = $studentA; school = $rpSchoolId },
    @{ id = $receiptB; student = $studentB; school = $rpSchoolId },
    @{ id = $receiptCross; student = $studentCross; school = $rpCrossSchoolId }
  )) {
    New-RpDocument 'receipts' $receipt.id @{
      id = New-RpString $receipt.id; schoolId = New-RpString $receipt.school
      studentId = New-RpString $receipt.student; amount = New-RpInt 1000
      testFixture = New-RpBool $true; testRunId = New-RpString $rpRunId
    }
  }

  $parent = New-RpAuthUser 'parent' $rpSchoolId @($studentA) $rpConfig.apiKey
  $secretary = New-RpAuthUser 'secretary' $rpSchoolId @() $rpConfig.apiKey
  $owner = New-RpAuthUser 'owner' $rpSchoolId @() $rpConfig.apiKey
  $crossStaff = New-RpAuthUser 'crossstaff' $rpCrossSchoolId @() $rpConfig.apiKey
  Remove-RpDocument 'users' $crossStaff.uid
  New-RpDocument 'users' $crossStaff.uid @{
    uid = New-RpString $crossStaff.uid; email = New-RpString $crossStaff.email; name = New-RpString 'Cross staff fixture'
    role = New-RpString 'secretary'; schoolId = New-RpString $rpCrossSchoolId
    active = New-RpBool $true; isActive = New-RpBool $true; studentIds = New-RpArray @()
    testFixture = New-RpBool $true; testRunId = New-RpString $rpRunId
  }

  Test-RpReceiptRead $parent.idToken $receiptA 200 'ownChild'
  Test-RpReceiptRead $parent.idToken $receiptB 403 'sameSchoolUnrelatedChild'
  Test-RpReceiptRead $parent.idToken $receiptCross 403 'otherSchool'
  Test-RpReceiptRead $secretary.idToken $receiptA 200 'secretary'
  Test-RpReceiptRead $owner.idToken $receiptA 200 'owner'
  Test-RpReceiptRead $crossStaff.idToken $receiptA 403 'crossSchoolStaff'
} catch {
  $rpFailure = $_
} finally {
  for ($round = 0; $round -lt 2; $round += 1) {
    foreach ($collection in @('audit_logs', 'receipts', 'students', 'users', 'schools')) {
      foreach ($row in @(Get-RpCollection $collection | Where-Object {
        $_.testRunId -eq $rpRunId -or $_.schoolId -in @($rpSchoolId, $rpCrossSchoolId)
      })) { Remove-RpDocument $collection $row.id }
    }
    foreach ($user in $rpCreatedUsers) { Remove-RpAuthUser $user.uid }
    if ($round -eq 0) { Start-Sleep -Seconds 2 }
  }
}

$rpResiduals = [ordered]@{}
foreach ($collection in @('schools', 'users', 'students', 'receipts', 'audit_logs')) {
  $rpResiduals[$collection] = @(Get-RpCollection $collection | Where-Object {
    $_.testRunId -eq $rpRunId -or $_.schoolId -in @($rpSchoolId, $rpCrossSchoolId)
  }).Count
}
$rpResiduals['authUsers'] = Get-RpAuthResidualCount
$rpOrphans = ($rpResiduals.Values | Measure-Object -Sum).Sum
$rpBaselineAfter = Get-RpBaseline
$rpRealDataModified = if (($rpBaselineBefore | ConvertTo-Json -Depth 8 -Compress) -eq ($rpBaselineAfter | ConvertTo-Json -Depth 8 -Compress)) { 0 } else { 1 }

$rpReport = [ordered]@{
  testRunId = $rpRunId
  fixtureSchool = $rpSchoolId
  baselineCapturedAt = $rpBaselineAt
  baselineCounts = [ordered]@{}
  results = $rpResults
  residuals = $rpResiduals
  orphans = $rpOrphans
  realDataModified = $rpRealDataModified
  cleanup = if ($rpOrphans -eq 0) { 'PASS' } else { 'FAIL' }
}
foreach ($collection in $rpBaselineCollections) { $rpReport.baselineCounts[$collection] = @($rpBaselineBefore[$collection]).Count }
$rpReport | ConvertTo-Json -Depth 8

if ($rpFailure) { throw $rpFailure }
if ($rpOrphans -ne 0) { throw 'Fixture cleanup residuals remain.' }
if ($rpRealDataModified -ne 0) { throw 'Real baseline changed.' }
