import os
import re

def refactor_html(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Get game name from h1
    game_name_match = re.search(r'<h1>(.*?)</h1>', content)
    game_name = game_name_match.group(1).upper() if game_name_match else "GAMEPASS"
    
    # Get game id (filename without extension)
    game_id = os.path.basename(file_path).replace('.html', '')

    # Find all gp-cards
    # Using a simple regex to find the blocks. This assumes a somewhat consistent formatting.
    card_pattern = re.compile(r'<div class="gp-card">.*?<img src="(.*?)".*?<h3 class="gp-card-title">(.*?)</h3>.*?<span class="gp-card-price">(.*?)</span>.*?</div>\s*</div>', re.DOTALL)
    
    def replace_card(match):
        img_src = match.group(1)
        title = match.group(2)
        price = match.group(3)
        
        # Simple ID generation for the detail link
        item_id = title.lower().replace(' ', '').replace('!', '').replace('.', '').replace('+', '')
        
        new_card = f"""        <a href="pages/gamepass-detail.html?game={game_id}&id={item_id}" class="gp-card">
          <div class="gp-card-top">
            <div class="gp-badge">{game_name}</div>
            <img src="{img_src}" alt="{title}">
          </div>
          <div class="gp-card-info">
            <h3 class="gp-card-title">{title}</h3>
            <div class="gp-card-price-row">
              <span class="gp-card-price">{price}</span>
              <span class="gp-card-pix">À vista no Pix</span>
            </div>
            <button class="gp-card-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
              </svg>
              Comprar agora
            </button>
          </div>
        </a>"""
        return new_card

    new_content = card_pattern.sub(replace_card, content)
    
    if new_content != content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return True
    return False

game_files = [
    '99forest.html', 'afs.html', 'arise.html', 'bfruits.html', 'bladeball.html',
    'block.html', 'brook.html', 'escapetsunami.html', 'fish.html', 'gpo.html',
    'hypershot.html', 'kingl.html', 'stealab.html', 'tapsimulator.html', 'vbl.html'
]

for file in game_files:
    if os.path.exists(file):
        success = refactor_html(file)
        print(f"Refactored {file}: {success}")
