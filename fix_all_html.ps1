$files = Get-ChildItem -Path . -Filter *.html -Recurse | Where-Object { $_.Name -ne "header.html" }
$headerLink = '  <link rel="stylesheet" href="/css/header.css">'
$fontsLink = '  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">'

foreach ($file in $files) {
    Write-Host "Cleaning and Syncing $($file.FullName)"
    $content = [System.IO.File]::ReadAllText($file.FullName)
    
    # 1. Standardize Head
    $content = $content -replace '<link rel=[''"]stylesheet[''"] href=[''"]([^"']*header\.css|[^"']*auth\.css)[''"] ?/?>', ''
    $content = $content -replace '<link href="https://fonts.googleapis.com/css2\?[^"]+" rel="stylesheet" ?/?>', ''
    $content = $content -replace '</head>', "$headerLink`r`n$fontsLink`r`n</head>"
    
    # 2. Standardize Body Top
    # Remove all header/auth/search structures
    $content = $content -replace '(?s)<header.*?</header>', ''
    $content = $content -replace '(?s)<!-- Search Overlay -->.*?</div>\s*</div>', ''
    $content = $content -replace '(?s)<!-- Auth Overlay -->.*?</div>\s*</div>', ''
    
    # Remove legacy scripts and links right after body
    $content = $content -replace '<body><header></header>[\s\S]*?(<canvas|<main)', '<body><header></header>`r`n$1'
    
    # If standard injection above didn't work (e.g. no canvas/main), ensure header is there
    if ($content -notmatch '<body><header></header>') {
        $content = $content -replace '(<body[^>]*>)', '$1<header></header>'
    }

    # 3. Global String Cleanup
    $content = $content -replace '\\n \\n \\n', ''
    
    # 4. Remove excessive line breaks
    $content = $content -replace "(`r`n){3,}", "`r`n`r`n"
    # Remove duplicates of the header/font links that might have been created
    while ($content -like "*$headerLink`r`n$headerLink*") {
        $content = $content -replace "$headerLink`r`n$headerLink", $headerLink
    }

    [System.IO.File]::WriteAllText($file.FullName, $content)
}
