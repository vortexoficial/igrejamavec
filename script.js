window.addEventListener('load', () => {

    const loader = document.getElementById('loader');
    
    // Tempo total: 6.0s (animações fase 2) + 0.5s (fade-out do loader) = 6.5s
    const TOTAL_ANIMATION_TIME = 6500; 

    setTimeout(() => {
        // Esconde o loader
        loader.classList.add('hidden');
        
        // Mostra o conteúdo principal
        const mainContent = document.querySelector('main');
        if (mainContent) {
            mainContent.style.display = 'block';
        }
        
    }, TOTAL_ANIMATION_TIME);

});