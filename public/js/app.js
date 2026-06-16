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
