$ErrorActionPreference = "Stop"

if ($PSVersionTable.PSVersion.Major -ne 5) {
  throw "Expected Windows PowerShell 5.1, found $($PSVersionTable.PSVersion)."
}

$fixture = Join-Path $PSScriptRoot "fixtures\stdio-child.ts"
$inputPath = Join-Path $env:TEMP "maximal-cli-powershell51-$PID.jsonl"
$request = '{"type":"invoke","id":"powershell-51","command":"echo","input":{"message":"through powershell"}}'

try {
  $request | Out-File -FilePath $inputPath -Encoding Unicode
  $inputBytes = [IO.File]::ReadAllBytes($inputPath)

  if ($inputBytes.Length -lt 2 -or $inputBytes[0] -ne 0xff -or $inputBytes[1] -ne 0xfe) {
    throw "Windows PowerShell did not produce BOM-marked UTF-16LE input."
  }

  $startInfo = New-Object Diagnostics.ProcessStartInfo
  $startInfo.FileName = (Get-Command node.exe).Source
  $startInfo.Arguments = "`"$fixture`""
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true

  $process = New-Object Diagnostics.Process
  $process.StartInfo = $startInfo
  [void]$process.Start()
  $process.StandardInput.BaseStream.Write($inputBytes, 0, $inputBytes.Length)
  $process.StandardInput.Close()
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()

  if ($process.ExitCode -ne 0) {
    throw "stdio child exited with $($process.ExitCode): $stderr"
  }
  if ($stderr.Length -ne 0) {
    throw "stdio child wrote to stderr: $stderr"
  }

  $result = $stdout | ConvertFrom-Json
  if (-not $result.ok -or $result.invocationId -ne "powershell-51" -or $result.data.echoed -ne "through powershell") {
    throw "stdio child returned an unexpected response: $stdout"
  }
} finally {
  Remove-Item -LiteralPath $inputPath -Force -ErrorAction SilentlyContinue
}
