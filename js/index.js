// Index Specific Logic
function initIndex() {
  // Status badge - verifica horário de funcionamento
  function updateStatus() {
    const badge = document.getElementById("statusBadge");
    
    // Lógica baseada puramente no horário (12:00 às 00:00)
    // Ignora o botão de emergência do banco de dados para os cards
    const hour = new Date().getHours();
    const isOpen = hour >= 12 && hour < 24;
    
    if (badge) {
      if (isOpen) {
        badge.innerHTML = `
          <span class="status-dot"></span>
          ONLINE • Atendimento Ativo
          <span class="badge-tooltip">
            <strong>Horário de funcionamento:</strong><br>
            Todos os dias: 12:00 às 00:00
          </span>
        `;
      } else {
        badge.innerHTML = `
          <span class="status-dot offline"></span>
          OFFLINE • Atendimento Inativo
          <span class="badge-tooltip">
            <strong>Horário de funcionamento:</strong><br>
            Todos os dias: 12:00 às 00:00
          </span>
        `;
      }
    }
  }

  updateStatus();
  setInterval(updateStatus, 60000);

  // Efeito de movimento no tooltip "Clique para ver os preços"
  const catalogBtn = document.getElementById("catalogBtn");
  const tooltip = catalogBtn?.querySelector(".btn-tooltip");

  catalogBtn?.addEventListener("mousemove", (e) => {
    if (!tooltip) return;
    
    const rect = catalogBtn.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const centerX = rect.width / 2;
    const offset = (x - centerX) / 10;
    
    tooltip.style.transform = `translateX(calc(-50% + ${offset}px))`;
  });

  catalogBtn?.addEventListener("mouseleave", () => {
    if (tooltip) {
      tooltip.style.transform = "translateX(-50%)";
    }
  });
}

// Initialize index-specific logic
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initIndex);
} else {
  initIndex();
}
