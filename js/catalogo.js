document.addEventListener('DOMContentLoaded', () => {
    const gamepassItems = document.querySelectorAll('.gp-extreme-card');
    const categoryItems = document.querySelectorAll('.category-item');
    const robuxSection = document.querySelector('.robux-custom-section');
    const gamepassSection = document.querySelector('.gp-extreme-section');

    categoryItems.forEach(categoryItem => {
        categoryItem.addEventListener('click', () => {
            categoryItems.forEach(item => item.classList.remove('active'));
            categoryItem.classList.add('active');
            const category = categoryItem.dataset.category;

            if (category === 'tudo') {
                if (robuxSection) robuxSection.style.display = 'block';
                if (gamepassSection) gamepassSection.style.display = 'block';
                gamepassItems.forEach(item => item.style.display = 'flex');
            } else if (category === 'gamepass') {
                if (robuxSection) robuxSection.style.display = 'none';
                if (gamepassSection) gamepassSection.style.display = 'block';
                gamepassItems.forEach(item => item.style.display = 'flex');
            } else if (category === 'robux') {
                if (robuxSection) robuxSection.style.display = 'block';
                if (gamepassSection) gamepassSection.style.display = 'none';
            }
        });
    });
});
