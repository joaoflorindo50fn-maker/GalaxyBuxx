document.addEventListener('DOMContentLoaded', () => {
  const tutorialNavItems = document.querySelectorAll('.tutorial-nav-item');
  const tutorialsList = document.getElementById('tutorialsList');
  const noResultsMessage = document.getElementById('noResults');
  const tutorialCards = document.querySelectorAll('.tutorial-card');

  function filterTutorials() {
    const activeCategory = document.querySelector('.tutorial-nav-item.active')?.dataset.category;
    let hasVisibleTutorials = false;

    tutorialCards.forEach(card => {
      const cardCategory = card.dataset.category?.toLowerCase();

      const matchesCategory = (activeCategory === 'tudo') || (cardCategory === activeCategory.toLowerCase());
      if (matchesCategory) {
        card.style.display = 'flex';
        hasVisibleTutorials = true;
      } else {
        card.style.display = 'none';
      }
    });

    if (noResultsMessage) {
      noResultsMessage.style.display = hasVisibleTutorials ? 'none' : 'block';
    }
  }

  tutorialNavItems.forEach(item => {
    item.addEventListener('click', () => {
      tutorialNavItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      filterTutorials();
    });
  });


  // Initial filter on page load
  filterTutorials();
});
