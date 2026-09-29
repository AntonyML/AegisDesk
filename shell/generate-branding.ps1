[CmdletBinding()]
param([switch]$Check)

# Mechanical format conversion; aegis_shell.png is the single source of branding.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$source = [Drawing.Image]::FromFile((Join-Path $PSScriptRoot 'assets/aegis_shell.png'))

function Convert-BrandImage([int]$Width, [int]$Height, [bool]$Bitmap) {
    $canvas = [Drawing.Bitmap]::new($Width, $Height)
    $graphics = [Drawing.Graphics]::FromImage($canvas)
    $stream = [IO.MemoryStream]::new()
    try {
        if ($Bitmap) { $graphics.Clear([Drawing.Color]::White) }
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $ratio = [Math]::Min($Width / $source.Width, $Height / $source.Height)
        $w = [int][Math]::Round($source.Width * $ratio)
        $h = [int][Math]::Round($source.Height * $ratio)
        $graphics.DrawImage($source, [int](($Width - $w) / 2), [int](($Height - $h) / 2), $w, $h)
        $format = if ($Bitmap) { [Drawing.Imaging.ImageFormat]::Bmp } else { [Drawing.Imaging.ImageFormat]::Png }
        $canvas.Save($stream, $format)
        return ,$stream.ToArray()
    } finally {
        $stream.Dispose(); $graphics.Dispose(); $canvas.Dispose()
    }
}

function Save-BrandAsset([string]$RelativePath, [byte[]]$Bytes) {
    $path = Join-Path $PSScriptRoot $RelativePath
    $matches = (Test-Path $path) -and ([Convert]::ToBase64String([IO.File]::ReadAllBytes($path)) -ceq [Convert]::ToBase64String($Bytes))
    if ($Check) {
        if (-not $matches) { throw "Brand asset differs from aegis_shell.png: $RelativePath" }
    } elseif (-not $matches) {
        [IO.File]::WriteAllBytes($path, $Bytes)
    }
}

try {
    $sizes = @(16, 24, 32, 48, 64, 128, 256)
    $frames = @($sizes | ForEach-Object { ,(Convert-BrandImage $_ $_ $false) })
    $stream = [IO.MemoryStream]::new()
    $writer = [IO.BinaryWriter]::new($stream)
    try {
        $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
        $offset = 6 + 16 * $sizes.Count
        for ($i = 0; $i -lt $sizes.Count; $i++) {
            $sizeByte = if ($sizes[$i] -eq 256) { 0 } else { $sizes[$i] }
            $writer.Write([byte]$sizeByte); $writer.Write([byte]$sizeByte)
            $writer.Write([byte]0); $writer.Write([byte]0)
            $writer.Write([uint16]1); $writer.Write([uint16]32)
            $writer.Write([uint32]$frames[$i].Length); $writer.Write([uint32]$offset)
            $offset += $frames[$i].Length
        }
        foreach ($frame in $frames) { $writer.Write([byte[]]$frame) }
        $writer.Flush()
        Save-BrandAsset 'assets/aegis_shell.ico' $stream.ToArray()
        Save-BrandAsset 'internal/assets/aegis_shell.ico' $stream.ToArray()
    } finally { $writer.Dispose(); $stream.Dispose() }
    Save-BrandAsset 'assets/wizard-brand.bmp' (Convert-BrandImage 164 314 $true)
    Save-BrandAsset 'assets/wizard-brand-small.bmp' (Convert-BrandImage 55 55 $true)
} finally { $source.Dispose() }
