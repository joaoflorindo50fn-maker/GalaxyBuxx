$files = Get-ChildItem -Path . -Filter *.html -Recurse | Where-Object { $_.Name -ne "header.html" }

foreach ($file in $files) {
    Write-Host "Final polish on $($file.FullName)"
    $content = [System.IO.File]::ReadAllText($file.FullName)
    
    # 1. Ensure absolute path for core.js at the bottom
    $content = $content -replace '<script src="(\.\./)?js/core.js"></script>', '<script src="/js/core.js"></script>'
    
    # 2. Clean up body top
    # Target specific rogue structures found in robux-details.html
    $content = $content -replace '(?s)<!-- Header -->.*?</div>\s*', ''
    $content = $content -replace '(?s)<body><header></header>.*?<main>', "<body><header></header>`r`n  <canvas id=""particles""></canvas>`r`n<main>"
    
    # Remove any duplicate particles canvas
    while ($content -like '*<canvas id="particles"></canvas>*<canvas id="particles"></canvas>*') {
        $content = $content -replace '<canvas id="particles"></canvas>\s*<canvas id="particles"></canvas>', '<canvas id="particles"></canvas>'
    }

    # 3. Standardize header/font links again (ensure no relative paths)
    $content = $content -replace '<link rel="stylesheet" href="(\.\./)?css/header.css">', '<link rel="stylesheet" href="/css/header.css">'
    
    # 4. Remove relative auth.css
    $content = $content -replace '<link rel="stylesheet" href="(\.\./)?css/auth.css" ?/?>', ''

    [System.IO.File]::WriteAllText($file.FullName, $content)
}
