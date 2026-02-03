const fs = require('fs').promises;
const path = require('path');

const headerRegex = /<!-- Header -->[\s\S]*?<\/header>/s;
const bodyTagRegex = /<body[^>]*>/;

async function replaceHeaders() {
  try {
    console.log('Reading new header content from header.html...');
    const newHeaderContent = await fs.readFile('header.html', 'utf-8');
    
    console.log('Defining HTML files to process...');
    const files = [
        'vbl.html', 'tutoriais.html', 'tutoriais/verificacao-identidade.html', 
        'tutoriais/status-remessa.html', 'tutoriais/saldos-pendentes.html', 
        'tutoriais/registro-atividades.html', 'tutoriais/modalidades-envio.html', 
        'tutoriais/como-criar-gamepass.html', 'tutoriais/ajuste-preco-regional.html', 
        'termos.html', 'tapsimulator.html', 'suporte.html', 'stealab.html', 
        'privacidade.html', 'pages/robux-details.html', 'kingl.html', 'index.html', 
        'hypershot.html', 'gpo.html', 'fish.html', 'escapetsunami.html', 'catalogo.html', 
        'brook.html', 'block.html', 'bladeball.html', 'bfruits.html', 'arise.html', 
        'afs.html', '99forest.html'
    ];

    console.log(`Found ${files.length} HTML files to process.`);

    for (const file of files) {
      try {
        let content = await fs.readFile(file, 'utf-8');
        
        if (content.includes('id="searchOverlay"')) {
            console.log(`Skipping ${file}: already contains the new header.`);
            continue;
        }

        const headerMatch = content.match(headerRegex);

        if (headerMatch) {
          content = content.replace(headerRegex, newHeaderContent);
          console.log(`Replaced header in ${file}`);
        } else {
          const bodyMatch = content.match(bodyTagRegex);
          if (bodyMatch) {
            content = content.replace(bodyTagRegex, `${bodyMatch[0]}\\n${newHeaderContent}`);
            console.log(`Injected header in ${file}`);
          } else {
            console.log(`Skipping ${file}: no <header> or <body> tag found.`);
            continue;
          }
        }
        
        await fs.writeFile(file, content, 'utf-8');
      } catch (err) {
        if (err.code === 'ENOENT') {
          console.error(`Skipping ${file}: file not found.`);
        } else {
          console.error(`Error processing file ${file}:`, err);
        }
      }
    }
    console.log('Header replacement process finished successfully.');
  } catch (error) {
    if (error.code === 'ENOENT' && error.path === 'header.html') {
        console.error('Error: header.html not found. Please ensure the file exists.');
    } else {
        console.error('An error occurred during the header replacement script:', error);
    }
  }
}

replaceHeaders();
