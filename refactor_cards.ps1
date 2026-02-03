$gameFiles = @('99forest.html', 'afs.html', 'arise.html', 'bfruits.html', 'bladeball.html', 'block.html', 'brook.html', 'escapetsunami.html', 'fish.html', 'gpo.html', 'hypershot.html', 'kingl.html', 'stealab.html', 'tapsimulator.html', 'vbl.html')

foreach ($file in $gameFiles) {
    if (Test-Path $file) {
        Write-Host "Processing $file..."
        $fullPath = (Resolve-Path $file).Path
        $content = [System.IO.File]::ReadAllText($fullPath, [System.Text.Encoding]::UTF8)
        
        # Get Game Name
        if ($content -match '<h1>(.*?)</h1>') {
            $gameName = $Matches[1].ToUpper()
        } else {
            $gameName = "GAMEPASS"
        }
        $gameId = $file.Replace(".html", "")

        # Updated Regex to handle existing refactored cards or old ones
        # This will basically re-refactor everything to ensure consistency and fix encoding
        $regex = '(?s)<a href="pages/gamepass-detail.html\?game=.*?&id=.*?" class="gp-card">.*?<div class="gp-badge">.*?</div>.*?<img src="(.*?)".*?<h3 class="gp-card-title">(.*?)</h3>.*?<span class="gp-card-price">(.*?)</span>.*?</a>'
        
        # If it's already refactored, the previous regex won't match. 
        # Let's try to match BOTH old and new to be safe.
        
        # Old pattern
        $oldRegex = '(?s)<div class="gp-card">.*?<img src="(.*?)".*?<h3 class="gp-card-title">(.*?)</h3>.*?<span class="gp-card-price">(.*?)</span>.*?</div>\s*</div>'
        
        # New pattern (from previous failed run)
        $newRegex = '(?s)<a href="pages/gamepass-detail.html\?game=.*?&id=.*?" class="gp-card">.*?<div class="gp-badge">.*?</div>.*?<img src="(.*?)".*?<h3 class="gp-card-title">(.*?)</h3>.*?<span class="gp-card-price">(.*?)</span>.*?</a>'

        $replacer = {
            param($m)
            $img = $m.Groups[1].Value
            $title = $m.Groups[2].Value
            $price = $m.Groups[3].Value
            $itemId = $title.ToLower().Replace(" ", "").Replace("!", "").Replace(".", "").Replace("+", "").Replace("-", "")
            
            return "        <a href=`"pages/gamepass-detail.html?game=$gameId&id=$itemId`" class=`"gp-card`">
          <div class=`"gp-card-top`">
            <div class=`"gp-badge`">$gameName</div>
            <img src=`"$img`" alt=`"$title`">
          </div>
          <div class=`"gp-card-info`">
            <h3 class=`"gp-card-title`">$title</h3>
            <div class=`"gp-card-price-row`">
              <span class=`"gp-card-price`">$price</span>
              <span class=`"gp-card-pix`">À vista no Pix</span>
            </div>
            <button class=`"gp-card-btn`">
              <svg viewBox=`"0 0 24 24`" fill=`"none`" stroke=`"currentColor`" stroke-width=`"2`">
                <circle cx=`"9`" cy=`"21`" r=`"1`"></circle><circle cx=`"20`" cy=`"21`" r=`"1`"></circle>
                <path d=`"M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6`"></path>
              </svg>
              Comprar agora
            </button>
          </div>
        </a>"
        }

        $content = [regex]::Replace($content, $oldRegex, $replacer)
        $content = [regex]::Replace($content, $newRegex, $replacer)
        
        [System.IO.File]::WriteAllText($fullPath, $content, (New-Object System.Text.UTF8Encoding $false))
    }
}
