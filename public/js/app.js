'use strict';

// JavaScript do cliente — minimo e progressivo.
// - Utilitario do orbe da Vera (estado visual).
// - Tela de Aplicacao (Fase 1B): troca de passos, steppers, chips, upload e envio.

(function () {
  // Alterna o estado visual do orbe: window.vmOrbe('falando'|'gravando'|'idle')
  window.vmOrbe = function (estado) {
    const orbe = document.querySelector('.vm-orb');
    if (!orbe) return;
    orbe.classList.remove('vm-orb--idle', 'vm-orb--falando', 'vm-orb--gravando');
    orbe.classList.add(`vm-orb--${estado}`);
    orbe.dataset.estado = estado;
  };
})();

// ── Tela de Aplicacao ──
(function () {
  const form = document.getElementById('form-aplicacao');
  if (!form) return;

  const MAX_PDF = 10 * 1024 * 1024;
  const areaErro = form.querySelector('[data-erro]');
  const passos = form.querySelectorAll('.vm-passo');

  function mostrarErro(msg) {
    areaErro.textContent = msg;
    areaErro.hidden = !msg;
    if (msg) areaErro.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function irParaPasso(n) {
    passos.forEach((p) => {
      p.hidden = Number(p.dataset.passo) !== n;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Steppers (- / +)
  form.querySelectorAll('[data-stepper]').forEach((st) => {
    const input = st.querySelector('input');
    const min = Number(input.min);
    const max = Number(input.max);
    st.querySelectorAll('.vm-stepper__btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        let v = Number(input.value) || 0;
        v += btn.dataset.acao === 'mais' ? 1 : -1;
        if (v < min) v = min;
        if (v > max) v = max;
        input.value = v;
      });
    });
  });

  // Chips de opcao unica (segmento) -> grava no input hidden de mesmo nome do grupo
  form.querySelectorAll('[data-opcao]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const grupo = chip.dataset.grupo;
      form
        .querySelectorAll(`[data-opcao][data-grupo="${grupo}"]`)
        .forEach((c) => c.classList.remove('vm-opcao--ativa'));
      chip.classList.add('vm-opcao--ativa');
      const hidden = form.querySelector(`input[name="${grupo}"]`);
      if (hidden) hidden.value = chip.dataset.valor;
    });
  });

  // Upload de PDF: clique (label nativo) + arrastar/soltar + validacao
  const upload = form.querySelector('[data-upload]');
  const inputArquivo = form.querySelector('input[name="curriculo"]');
  const textoUpload = form.querySelector('[data-upload-texto]');

  function validarArquivo(file) {
    if (!file) return true;
    const ehPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!ehPdf) {
      mostrarErro('Envie o currículo em formato PDF.');
      return false;
    }
    if (file.size > MAX_PDF) {
      mostrarErro('O currículo deve ter no máximo 10 MB.');
      return false;
    }
    return true;
  }

  inputArquivo.addEventListener('change', () => {
    const file = inputArquivo.files[0];
    if (file && validarArquivo(file)) {
      mostrarErro('');
      textoUpload.textContent = file.name;
      upload.classList.add('vm-upload--ok');
    }
  });

  ['dragover', 'dragenter'].forEach((ev) =>
    upload.addEventListener(ev, (e) => {
      e.preventDefault();
      upload.classList.add('vm-upload--sobre');
    }),
  );
  ['dragleave', 'drop'].forEach((ev) =>
    upload.addEventListener(ev, (e) => {
      e.preventDefault();
      upload.classList.remove('vm-upload--sobre');
    }),
  );
  upload.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file && validarArquivo(file)) {
      inputArquivo.files = e.dataTransfer.files;
      mostrarErro('');
      textoUpload.textContent = file.name;
      upload.classList.add('vm-upload--ok');
    }
  });

  // Validacao basica do passo 1 (conveniencia; o servidor revalida)
  function validarPasso1() {
    const obrig = [
      ['nome', 'nome'],
      ['sobrenome', 'sobrenome'],
      ['email', 'e-mail'],
      ['telefone', 'telefone'],
    ];
    for (const [name, rotulo] of obrig) {
      const campo = form.querySelector(`[name="${name}"]`);
      if (!campo.value.trim()) {
        mostrarErro(`Preencha o campo ${rotulo}.`);
        campo.focus();
        return false;
      }
    }
    const email = form.querySelector('[name="email"]').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      mostrarErro('Informe um e-mail válido.');
      return false;
    }
    if (!inputArquivo.files[0]) {
      mostrarErro('Anexe seu currículo em PDF.');
      return false;
    }
    if (!validarArquivo(inputArquivo.files[0])) return false;
    return true;
  }

  form.querySelector('[data-proximo]').addEventListener('click', () => {
    if (validarPasso1()) {
      mostrarErro('');
      irParaPasso(2);
    }
  });
  form.querySelector('[data-voltar]').addEventListener('click', () => irParaPasso(1));

  // Envio
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validarPasso1()) {
      irParaPasso(1);
      return;
    }
    const btn = form.querySelector('[data-enviar]');
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    try {
      const resp = await fetch('/api/aplicacao', { method: 'POST', body: new FormData(form) });
      const dados = await resp.json();
      if (resp.ok && dados.ok) {
        window.location = dados.redirect || '/preparacao';
        return;
      }
      mostrarErro(dados.erro || 'Não foi possível enviar sua candidatura.');
    } catch (err) {
      mostrarErro('Falha de conexão. Verifique sua internet e tente novamente.');
    }
    btn.disabled = false;
    btn.textContent = 'Candidatar-me';
  });
})();

// ── Utilitarios de midia (Fase 2): mensagens de erro PT-BR + parar tracks ──
const VM_MIDIA = {
  mensagemErro(err, tipo) {
    const dispositivo = tipo === 'camera' ? 'câmera' : 'microfone';
    const nome = err && err.name ? err.name : '';
    if (nome === 'NotAllowedError' || nome === 'SecurityError') {
      return (
        `Permissão de ${dispositivo} negada. Para reativar: toque no ícone de cadeado/` +
        `${dispositivo} na barra de endereço do navegador e permita o acesso (ou ajuste nas ` +
        `configurações do navegador/sistema). Você também pode continuar sem câmera.`
      );
    }
    if (nome === 'NotFoundError' || nome === 'DevicesNotFoundError') {
      return `Nenhuma ${dispositivo} encontrada. Você pode continuar sem câmera.`;
    }
    if (nome === 'NotReadableError' || nome === 'TrackStartError') {
      return `Não foi possível acessar a ${dispositivo} (pode estar em uso por outro app).`;
    }
    return `Não foi possível acessar a ${dispositivo}. Verifique as permissões e tente novamente.`;
  },
  pararTracks(stream) {
    if (stream) stream.getTracks().forEach((t) => t.stop());
  },
  suportado() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  },
};

// ── Tela 6: Permissao de camera ──
(function () {
  const btn = document.querySelector('[data-permitir-camera]');
  if (!btn) return;
  const erro = document.querySelector('[data-cam-erro]');

  function mostrarErro(msg) {
    erro.textContent = msg;
    erro.hidden = !msg;
  }

  btn.addEventListener('click', async () => {
    mostrarErro('');
    if (!VM_MIDIA.suportado()) {
      mostrarErro('Seu navegador não suporta acesso à câmera. Você pode continuar sem câmera.');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Solicitando...';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Nao precisamos manter o stream aqui: paramos as tracks e seguimos.
      VM_MIDIA.pararTracks(stream);
      window.location = '/teste-camera';
    } catch (err) {
      mostrarErro(VM_MIDIA.mensagemErro(err, 'camera'));
      btn.disabled = false;
      btn.textContent = 'Permitir câmera';
    }
  });
})();

// ── Tela 7: Teste de camera (preview ao vivo) ──
(function () {
  const tela = document.querySelector('[data-tela-teste-camera]');
  if (!tela) return;
  const video = tela.querySelector('[data-preview-camera]');
  const erro = tela.querySelector('[data-cam-erro]');
  let streamAtual = null;

  function mostrarErro(msg) {
    erro.textContent = msg;
    erro.hidden = !msg;
  }
  function pararPreview() {
    VM_MIDIA.pararTracks(streamAtual);
    streamAtual = null;
  }

  async function iniciarPreview() {
    if (!VM_MIDIA.suportado()) {
      mostrarErro('Seu navegador não suporta acesso à câmera. Você pode continuar sem câmera.');
      return;
    }
    try {
      streamAtual = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = streamAtual;
    } catch (err) {
      mostrarErro(VM_MIDIA.mensagemErro(err, 'camera'));
    }
  }

  // Ao sair/continuar/pular: para as tracks (apaga a luz da webcam).
  tela.querySelectorAll('[data-continuar], [data-pular]').forEach((link) => {
    link.addEventListener('click', () => pararPreview());
  });
  window.addEventListener('pagehide', pararPreview);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pararPreview();
  });

  iniciarPreview();
})();

// ── Tela de Identificacao ──
(function () {
  const form = document.getElementById('form-identificacao');
  if (!form) return;
  const areaErro = form.querySelector('[data-erro]');

  function mostrarErro(msg) {
    areaErro.textContent = msg;
    areaErro.hidden = !msg;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.querySelector('[name="email"]').value.trim();
    const codigo = form.querySelector('[name="codigo"]').value.trim();
    if (!email || !codigo) {
      mostrarErro('Informe e-mail e código de acesso.');
      return;
    }
    const btn = form.querySelector('[data-enviar]');
    btn.disabled = true;
    btn.textContent = 'Verificando...';
    try {
      const resp = await fetch('/api/identificacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, codigo }),
      });
      const dados = await resp.json();
      if (resp.ok && dados.ok) {
        window.location = dados.redirect || '/preparacao';
        return;
      }
      mostrarErro(dados.erro || 'Não encontramos uma candidatura com esses dados.');
    } catch (err) {
      mostrarErro('Falha de conexão. Verifique sua internet e tente novamente.');
    }
    btn.disabled = false;
    btn.textContent = 'Continuar';
  });
})();
