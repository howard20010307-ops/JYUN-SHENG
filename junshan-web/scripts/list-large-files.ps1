$root = Join-Path (Get-Location) 'src'
Get-ChildItem -Path $root -Recurse -Include *.ts,*.tsx -File |
  ForEach-Object {
    $lines = (Get-Content $_.FullName | Measure-Object -Line).Lines
    [PSCustomObject]@{
      Lines = $lines
      KB    = [math]::Round($_.Length / 1024, 1)
      Path  = $_.FullName.Replace($root + [IO.Path]::DirectorySeparatorChar, '')
    }
  } |
  Sort-Object Lines -Descending |
  Select-Object -First 15 |
  Format-Table -AutoSize
