$files = Get-ChildItem -Path . -Filter *.html -Recurse | Where-Object { $_.Name -ne "header.html" }
$headerCssLink = '  <link rel="stylesheet" href="/css/header.css">'
$fontsLink = '  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">'

foreach ($file in $files) {
    Write-Host "Syncing $($file.FullName)"
    $content = [System.IO.File]::ReadAllText($file.FullName)
    
    # 1. Clean Head
    $content = $content -replace '<link rel=[''"]stylesheet[''"] href=[''"](\.\./)?css/header.css[''"]>', ''
    $content = $content -replace '<link href="https://fonts.googleapis.com/css2\?[^"]+" rel="stylesheet" ?/?>', ''
    
    # 2. Clean Body
    # Remove existing header structures
    $content = $content -replace '(?s)<header.*?</header>', ''
    
    # 3. Inject correct structure
    $newHeadLinks = "$headerCssLink`r`n$fontsLink`r`n"
    $content = $content -replace '</head>', ($newHeadLinks + "</head>")
    $content = $content -replace '(<body[^>]*>)', '$1<header></header>'
    
    # 4. Remove Legacy Elements
    $content = $content -replace '(?s)<!-- Search Overlay -->.*?</div>\s*</div>', ''
    $content = $content -replace '(?s)<!-- Auth Overlay -->.*?</div>\s*</div>', ''
    $content = $content -replace '<link rel="stylesheet" href="(\.\./)?css/auth.css" ?/?>', ''
    
    # Final cleanup of excessive whitespace
    $content = $content -replace "(`r`n){3,}", "`r`n`r`n"

    [System.IO.File]::WriteAllText($file.FullName, $content)
}
