$files = Get-ChildItem -Path . -Filter *.html -Recurse | Where-Object { $_.Name -ne "header.html" }
foreach ($file in $files) {
    Write-Host "Processing $($file.FullName)"
    $content = [System.IO.File]::ReadAllText($file.FullName)
    
    # Remove existing header tags (including potential duplicates)
    $content = $content -replace '<header></header>', ''
    
    # Remove existing header.css links
    $content = $content -replace '<link rel=[''"]stylesheet[''"] href=[''"]/css/header.css[''"]>', ''
    
    # Remove existing Google Font links that mention Space Grotesk
    $content = $content -replace '<link href="https://fonts.googleapis.com/css2\?family=[^"]*Space\+Grotesk[^"]*" rel="stylesheet">', ''
    
    # Standardize Head
    $newHeadLinks = "  <link rel=""stylesheet"" href=""/css/header.css"">`r`n  <link href=""https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap"" rel=""stylesheet"">`r`n"
    $content = $content -replace '</head>', ($newHeadLinks + "</head>")
    
    # Standardize Body
    $content = $content -replace '(<body[^>]*>)', ('$1' + "<header></header>")
    
    # Final cleanup of duplicates that might have been missed by simple replace
    while ($content -like "*<header></header><header></header>*") {
        $content = $content -replace '<header></header><header></header>', '<header></header>'
    }

    [System.IO.File]::WriteAllText($file.FullName, $content)
}
