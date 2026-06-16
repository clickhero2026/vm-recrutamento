'use strict';

// JavaScript do cliente — minimo na Fase 0.
// Aqui entrarao: navegacao do funil, captura de midia (Fase 2) e o loop
// push-to-talk da entrevista (Fase 3). Por ora, so um utilitario para alternar
// o estado visual do orbe, util para testar a animacao manualmente.

(function () {
  // Permite alternar o estado do orbe via: window.vmOrbe('falando'|'gravando'|'idle')
  window.vmOrbe = function (estado) {
    const orbe = document.querySelector('.vm-orb');
    if (!orbe) return;
    orbe.classList.remove('vm-orb--idle', 'vm-orb--falando', 'vm-orb--gravando');
    orbe.classList.add(`vm-orb--${estado}`);
    orbe.dataset.estado = estado;
  };
})();
