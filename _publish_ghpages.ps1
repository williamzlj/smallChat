$ErrorActionPreference = 'Stop'
# --- 1. get github token via git credential fill (file redirection) ---
$env:PATH = 'C:\Program Files\Git\cmd;' + $env:PATH
$inF = New-TemporaryFile; $outF = New-TemporaryFile
[System.IO.File]::WriteAllText($inF.FullName, "protocol=https`nhost=github.com`n`n")
Start-Process git -ArgumentList 'credential','fill' -RedirectStandardInput $inF.FullName -RedirectStandardOutput $outF.FullName -NoNewWindow -Wait
$cred = [System.IO.File]::ReadAllText($outF.FullName)
Remove-Item $inF.FullName, $outF.FullName
$token = ($cred -split "`n" | Where-Object { $_ -like 'password=*' }).Substring(9).Trim()
if (-not $token) { throw 'no token' }

$repo = 'williamzlj/smallChat'
$apiBase = "https://api.github.com/repos/$repo"
function Gh($method, $url, $bodyFile) {
  $args = @('-s', '-X', $method, $url, '-H', "Authorization: token $token", '-H', 'Accept: application/vnd.github+json', '-H', 'User-Agent: smallchat-publish')
  if ($bodyFile) { $args += @('--data', "@$bodyFile") }
  $out = & curl.exe @args
  return $out | ConvertFrom-Json
}
function GhJson($obj) {
  $f = New-TemporaryFile
  $json = $obj | ConvertTo-Json -Depth 10 -Compress
  [System.IO.File]::WriteAllText($f.FullName, $json, (New-Object System.Text.UTF8Encoding($false)))
  return $f
}

# --- 2. version marker ---
$dist = 'c:\Users\liang\Documents\trae_projects\smallChat\Browser\dist'
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
[System.IO.File]::WriteAllText("$dist\version.txt", "deploy $stamp")

# --- 3. collect files ---
$files = Get-ChildItem $dist -Recurse -File | ForEach-Object { $_.FullName.Substring($dist.Length + 1).Replace('\', '/') }
Write-Output ("files: " + ($files -join ', '))

# --- 4. current ref + old hashed assets cleanup ---
$ref = Gh 'GET' "$apiBase/git/ref/heads/gh-pages" $null
$baseSha = $ref.object.sha
$tree = Gh 'GET' "$apiBase/git/trees/$baseSha`?recursive=1" $null
$stale = @()
foreach ($e in $tree.tree) {
  if ($e.path -match '^assets/index-[^/]+\.(js|css)$' -and ($files -notcontains $e.path)) { $stale += $e.path }
}

# --- 5. blobs ---
$entries = @()
foreach ($rel in $files) {
  $bytes = [System.IO.File]::ReadAllBytes("$dist\$($rel.Replace('/','\'))")
  $b64 = [System.Convert]::ToBase64String($bytes)
  $bf = GhJson @{ content = $b64; encoding = 'base64' }
  $blob = Gh 'POST' "$apiBase/git/blobs" $bf
  Remove-Item $bf
  $entries += @{ path = $rel; mode = '100644'; type = 'blob'; sha = $blob.sha }
  Write-Output "blob $rel"
}
foreach ($s in $stale) { $entries += @{ path = $s; mode = '100644'; type = 'blob'; sha = $null } }

# --- 6. tree + commit + ref ---
$tf = GhJson @{ base_tree = $baseSha; tree = $entries }
$newTree = Gh 'POST' "$apiBase/git/trees" $tf
Remove-Item $tf
$cf = GhJson @{ message = "deploy $stamp"; tree = $newTree.sha; parents = @($baseSha) }
$commit = Gh 'POST' "$apiBase/git/commits" $cf
Remove-Item $cf
$rf = GhJson @{ sha = $commit.sha; force = $false }
$null = Gh 'PATCH' "$apiBase/git/refs/heads/gh-pages" $rf
Remove-Item $rf
Write-Output "published commit $($commit.sha)"
