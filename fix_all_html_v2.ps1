$files = Get-ChildItem -Path . -Filter *.html -Recurse | Where-Object { $_.Name -ne "header.html" }
$headerLink = '  <link rel="stylesheet" href="/css/header.css">'
$fontsLink = '  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">'

foreach ($file in $files) {
    Write-Host "Syncing $($file.FullName)"
    $content = [System.IO.File]::ReadAllText($file.FullName)
    
    # Remove existing header.css links
    $content = $content -replace '<link rel="stylesheet" href=".*?header\.css">', ''
    $content = $content -replace '<link rel=''stylesheet'' href=''.*?header\.css''>', ''
    
    # Remove existing Google font links
    $content = $content -replace '<link href="https://fonts\.googleapis\.com/css2\?[^"]+" rel="stylesheet" ?/?>', ''
    
    # Inject correct links before </head>
    $newLinks = "$headerLink`r`n$fontsLink`r`n"
    $content = $content -replace '</head>', ($newLinks + "</head>")
    
    # Body Cleanup
    # Remove any header structure
    $content = $content -replace '(?s)<header.*?</header>', ''
    
    # Standardize start of body
    $content = $content -replace '(?s)<body[^>]*>.*?(<canvas|<main)', ("<body><header></header>`r`n" + '$1')
    
    # Remove legacy auth/search comments/divs if they were missed
    $content = $content -replace '(?s)<!-- Search Overlay -->.*?</div>\s*</div>', ''
    $content = $content -replace '(?s)<!-- Auth Overlay -->.*?</div>\s*</div>', ''
    $content = $content -replace '<link rel="stylesheet" href=".*?auth\.css" ?/?>', ''

    [System.IO.File]::WriteAllText($file.FullName, $content)
}
