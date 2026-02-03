// Navigation direction fix for animations
function initNavDirection() {
  const referrer = document.referrer;
  const currentPath = window.location.pathname;
  
  // Define navigation order
  const navOrder = ['index.html', 'catalogo.html', 'tutoriais.html', 'suporte.html'];
  
  // Get current and previous page index
  let currentIndex = -1;
  let previousIndex = -1;
  
  navOrder.forEach((page, idx) => {
    if (currentPath.includes(page)) currentIndex = idx;
    if (referrer.includes(page)) previousIndex = idx;
  });
  
  // Determine direction
  const comingFromLeft = previousIndex !== -1 && previousIndex < currentIndex;
  const comingFromRight = previousIndex !== -1 && previousIndex > currentIndex;
  
  // Fix the nav link direction
  const activeNav = document.querySelector('header nav ul li a.active');
  if (activeNav) {
    activeNav.classList.remove('from-left', 'from-right');
    if (comingFromLeft) {
      activeNav.classList.add('from-left');
    } else if (comingFromRight) {
      activeNav.classList.add('from-right');
    } else {
      // Default to right if no referrer
      activeNav.classList.add('from-right');
    }
  }
}

// Will be called by core.js after header is injected
window.initNavDirection = initNavDirection;

