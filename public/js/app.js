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

// ── Tela 8: Permissao de microfone (obrigatorio) ──
(function () {
  const btn = document.querySelector('[data-permitir-mic]');
  if (!btn) return;
  const btnTentar = document.querySelector('[data-tentar-mic]');
  const erro = document.querySelector('[data-mic-erro]');

  function mostrarErro(msg) {
    erro.textContent = msg;
    erro.hidden = !msg;
    btnTentar.hidden = !msg; // "Tentar de novo" relanca o pedido
  }

  async function pedirMicrofone() {
    mostrarErro('');
    if (!VM_MIDIA.suportado()) {
      mostrarErro('Seu navegador não suporta acesso ao microfone. Tente outro navegador.');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Solicitando...';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      VM_MIDIA.pararTracks(stream); // so confirmamos a permissao aqui
      window.location = '/teste-microfone';
    } catch (err) {
      mostrarErro(VM_MIDIA.mensagemErro(err, 'microfone'));
      btn.disabled = false;
      btn.textContent = 'Permitir microfone';
    }
  }

  btn.addEventListener('click', pedirMicrofone);
  btnTentar.addEventListener('click', pedirMicrofone);
})();

// ── Tela 9: Teste de microfone (medidor de nivel via Web Audio API) ──
(function () {
  const tela = document.querySelector('[data-tela-teste-mic]');
  if (!tela) return;

  // Flag de dev: ative com ?vmdev=1 na URL para ver os logs de diagnostico.
  const VM_DEV = new URLSearchParams(location.search).has('vmdev');

  const btnFalar = tela.querySelector('[data-falar]');
  const btnContinuar = tela.querySelector('[data-continuar-mic]');
  const linkAssim = tela.querySelector('[data-continuar-assim]');
  const barra = tela.querySelector('[data-nivel-mic]');
  const status = tela.querySelector('[data-status-mic]');
  const nota = tela.querySelector('[data-nota-seguranca]');
  const erro = tela.querySelector('[data-mic-erro]');

  // Deteccao tolerante: piso baixo + acumulo de ~800ms, tolerando pausas.
  const LIMIAR_RMS = 0.025;
  const TEMPO_ALVO_MS = 800;
  const SEGURANCA_MS = 8000; // rede de seguranca: habilita CONTINUAR mesmo sem cruzar o limiar

  let stream = null;
  let audioCtx = null;
  let raf = null;
  let timerSeguranca = null;
  let acumuladoMs = 0;
  let ultimoTs = 0;
  let testando = false;
  let concluido = false;
  let ultimoLogTs = 0;

  function mostrarErro(msg) {
    erro.textContent = msg;
    erro.hidden = !msg;
  }

  function habilitarContinuar() {
    btnContinuar.disabled = false;
  }

  // Para a analise e libera o microfone (AudioContext fechado, tracks paradas).
  function pararAnalise() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    if (timerSeguranca) {
      clearTimeout(timerSeguranca);
      timerSeguranca = null;
    }
    VM_MIDIA.pararTracks(stream);
    stream = null;
    if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
    audioCtx = null;
    testando = false;
    barra.style.width = '0%';
  }

  function navegarEntrevista() {
    pararAnalise();
    window.location = '/entrevista';
  }

  function concluir() {
    if (concluido) return;
    concluido = true;
    status.textContent = '✓ Verificação concluída';
    status.classList.add('vm-status--ok');
    nota.hidden = true;
    habilitarContinuar();
    pararAnalise(); // libera o microfone assim que verificamos
    btnFalar.textContent = 'Testar de novo';
    btnFalar.disabled = false;
  }

  // Estado final manual (usuario parou o teste sem concluir).
  function pararManual() {
    pararAnalise();
    if (!concluido) {
      status.textContent = '';
      status.classList.remove('vm-status--ok');
    }
    btnFalar.textContent = concluido ? 'Testar de novo' : 'Falar';
    btnFalar.disabled = false;
  }

  async function comecar() {
    mostrarErro('');
    if (!VM_MIDIA.suportado()) {
      mostrarErro('Seu navegador não suporta acesso ao microfone. Tente outro navegador.');
      return;
    }
    acumuladoMs = 0;
    concluido = false;
    testando = true;
    btnFalar.textContent = 'Parar';
    status.textContent = 'Ouvindo...';
    status.classList.remove('vm-status--ok');
    nota.hidden = true;

    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Se o usuario parou durante o await, libera e nao inicia a analise.
      if (!testando) {
        VM_MIDIA.pararTracks(s);
        return;
      }
      stream = s;
      const AudioCtx = window.AudioContext || window.webkitAudioContext; // iOS
      audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') await audioCtx.resume(); // iOS exige gesto
      const fonte = audioCtx.createMediaStreamSource(stream);
      const analisador = audioCtx.createAnalyser();
      analisador.fftSize = 1024;
      fonte.connect(analisador);
      const dados = new Uint8Array(analisador.fftSize);
      ultimoTs = performance.now();

      // Rede de seguranca: com o microfone concedido, nunca prender o usuario.
      timerSeguranca = setTimeout(() => {
        if (!concluido && stream) {
          habilitarContinuar();
          nota.hidden = false;
          nota.textContent = 'Se você se ouviu no medidor, pode continuar.';
          if (VM_DEV) console.log('[mic] rede de seguranca: CONTINUAR habilitado apos 8s');
        }
      }, SEGURANCA_MS);

      function loop(ts) {
        const dt = ts - ultimoTs;
        ultimoTs = ts;
        analisador.getByteTimeDomainData(dados);
        let soma = 0;
        for (let i = 0; i < dados.length; i++) {
          const v = (dados[i] - 128) / 128;
          soma += v * v;
        }
        const rms = Math.sqrt(soma / dados.length);
        const nivel = Math.min(1, rms * 3.2); // amplifica p/ exibicao
        barra.style.width = `${Math.round(nivel * 100)}%`;

        if (rms > LIMIAR_RMS) acumuladoMs += dt;
        else acumuladoMs = Math.max(0, acumuladoMs - dt * 0.4); // decaimento suave, tolera pausas

        // Log de diagnostico (atras do flag de dev), throttled ~4x/s.
        if (VM_DEV && ts - ultimoLogTs > 250) {
          ultimoLogTs = ts;
          console.log(
            `[mic] rms=${rms.toFixed(4)} limiar=${LIMIAR_RMS} acumulado=${Math.round(acumuladoMs)}ms`,
          );
        }

        if (acumuladoMs >= TEMPO_ALVO_MS) {
          concluir();
          return;
        }
        raf = requestAnimationFrame(loop);
      }
      raf = requestAnimationFrame(loop);
    } catch (err) {
      mostrarErro(VM_MIDIA.mensagemErro(err, 'microfone'));
      pararAnalise();
      btnFalar.textContent = 'Falar';
      btnFalar.disabled = false;
    }
  }

  // FALAR e um toggle real: inicia / para o teste manualmente.
  btnFalar.addEventListener('click', () => {
    if (testando) pararManual();
    else comecar();
  });

  // CONTINUAR (so habilita apos concluir ou apos a rede de seguranca).
  btnContinuar.addEventListener('click', navegarEntrevista);

  // "Continuar mesmo assim": sempre disponivel (microfone foi concedido na Tela 8).
  linkAssim.addEventListener('click', (e) => {
    e.preventDefault();
    navegarEntrevista();
  });

  // Libera o microfone ao sair da tela.
  window.addEventListener('pagehide', pararAnalise);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pararAnalise();
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

// ── Tela 10: Entrevista (loop push-to-talk com a Vera) ──
(function () {
  const tela = document.querySelector('[data-entrevista]');
  if (!tela) return;

  const orbe = tela.querySelector('[data-orbe]');
  const estadoTexto = tela.querySelector('[data-estado-texto]');
  const elPergunta = tela.querySelector('[data-pergunta]');
  const elChips = tela.querySelector('[data-chips]');
  const elTimer = tela.querySelector('[data-timer]');
  const elErro = tela.querySelector('[data-erro]');
  const btnPtt = tela.querySelector('[data-ptt]');
  const btnRepetir = tela.querySelector('[data-repetir]');
  const overlayIniciar = tela.querySelector('[data-iniciar]');
  const btnIniciar = tela.querySelector('[data-iniciar-btn]');
  const audio = tela.querySelector('[data-audio]');
  const camThumb = tela.querySelector('[data-cam-thumb]');
  const camVideo = tela.querySelector('[data-cam-video]');

  let interviewId = null;
  let ultimoAudioUrl = null;
  let gravando = false;
  let recorder = null;
  let chunks = [];
  let micStream = null;
  let camStream = null;
  let timerId = null;
  let inicioMs = 0;
  let encerrando = false;

  const ESTADOS = {
    idle: '',
    falando: 'Vera está falando…',
    gravando: 'Gravando… (toque para enviar)',
    pensando: 'Vera está pensando…',
  };

  function setOrbe(estado) {
    orbe.classList.remove('vm-orb--idle', 'vm-orb--falando', 'vm-orb--gravando', 'vm-orb--pensando');
    orbe.classList.add(`vm-orb--${estado}`);
    estadoTexto.textContent = ESTADOS[estado] || '';
  }

  function mostrarErro(msg) {
    elErro.textContent = msg || '';
    elErro.hidden = !msg;
  }

  function renderChips(topicos) {
    if (!Array.isArray(topicos)) return;
    elChips.innerHTML = topicos
      .map(
        (t) =>
          `<span class="vm-chip vm-chip--${t.estado}">${(t.nome || '').replace(/[<>&]/g, '')}</span>`,
      )
      .join('');
  }

  function tocarFala(url, aoTerminar) {
    if (!url) return;
    setOrbe('falando');
    audio.src = url;
    audio.onended = () => {
      setOrbe('idle');
      if (aoTerminar) aoTerminar();
    };
    audio.play().catch(() => {
      // Se o navegador bloquear, segue mesmo assim (texto sempre visivel).
      setOrbe('idle');
      if (aoTerminar) aoTerminar();
    });
  }

  function formatarTempo(ms) {
    const s = Math.floor(ms / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function iniciarTimer() {
    inicioMs = Date.now();
    timerId = setInterval(() => {
      elTimer.textContent = formatarTempo(Date.now() - inicioMs);
    }, 1000);
  }

  function pararTudo() {
    if (timerId) clearInterval(timerId);
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch (e) { /* ignore */ }
    }
    VM_MIDIA.pararTracks(micStream);
    VM_MIDIA.pararTracks(camStream);
    micStream = null;
    camStream = null;
  }

  // Thumbnail da webcam — apenas se a camera ja foi concedida (nao pede prompt aqui).
  async function talvezMostrarCamera() {
    try {
      if (!navigator.permissions || !navigator.permissions.query) return;
      const status = await navigator.permissions.query({ name: 'camera' });
      if (status.state !== 'granted') return;
      camStream = await navigator.mediaDevices.getUserMedia({ video: true });
      camVideo.srcObject = camStream;
      camThumb.hidden = false;
    } catch (e) {
      // Sem camera concedida ou navegador sem suporte: simplesmente nao mostra.
    }
  }

  function aplicarResposta(dados) {
    if (dados.encerrar) {
      encerrando = true;
      elPergunta.textContent = dados.pergunta || '';
      if (Array.isArray(dados.topicos)) renderChips(dados.topicos);
      btnPtt.hidden = true;
      btnRepetir.hidden = true;
      tocarFala(dados.audio_url, () => {
        window.location = '/finalizacao';
      });
      return;
    }
    elPergunta.textContent = dados.pergunta || '';
    ultimoAudioUrl = dados.audio_url;
    if (Array.isArray(dados.topicos)) renderChips(dados.topicos);
    tocarFala(dados.audio_url);
    btnPtt.disabled = false;
    btnPtt.textContent = 'Toque para falar';
  }

  async function iniciarEntrevista() {
    mostrarErro('');
    try {
      const resp = await fetch('/api/interview/start', { method: 'POST' });
      const dados = await resp.json();
      if (!resp.ok || !dados.ok) {
        mostrarErro(dados.erro || 'Não foi possível iniciar a entrevista.');
        return;
      }
      interviewId = dados.interview_id;
      ultimoAudioUrl = dados.audio_url;
      elPergunta.textContent = dados.pergunta || '';
      renderChips(dados.topicos);
      btnPtt.hidden = false;
      btnRepetir.hidden = false;
      iniciarTimer();
      tocarFala(dados.audio_url);
      talvezMostrarCamera();
    } catch (e) {
      mostrarErro('Falha de conexão ao iniciar a entrevista.');
    }
  }

  function escolherMime() {
    const tipos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    for (const t of tipos) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
  }

  async function comecarGravacao() {
    mostrarErro('');
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      mostrarErro(VM_MIDIA.mensagemErro(e, 'microfone'));
      return;
    }
    const mime = escolherMime();
    recorder = mime ? new MediaRecorder(micStream, { mimeType: mime }) : new MediaRecorder(micStream);
    chunks = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };
    recorder.onstop = enviarResposta;
    recorder.start();
    gravando = true;
    setOrbe('gravando');
    btnPtt.textContent = 'Gravando… (toque para enviar)';
    btnPtt.classList.add('vm-ptt--gravando');
  }

  async function enviarResposta() {
    gravando = false;
    btnPtt.classList.remove('vm-ptt--gravando');
    VM_MIDIA.pararTracks(micStream);
    micStream = null;
    setOrbe('pensando');
    btnPtt.disabled = true;

    const tipo = recorder && recorder.mimeType ? recorder.mimeType : 'audio/webm';
    const blob = new Blob(chunks, { type: tipo });
    const form = new FormData();
    form.append('interview_id', interviewId);
    form.append('audio', blob, 'resposta.webm');

    try {
      const resp = await fetch('/api/interview/answer', { method: 'POST', body: form });
      const dados = await resp.json();
      if (!resp.ok || !dados.ok) {
        mostrarErro(dados.erro || 'Não foi possível enviar sua resposta.');
        setOrbe('idle');
        btnPtt.disabled = false;
        btnPtt.textContent = 'Toque para falar';
        return;
      }
      aplicarResposta(dados);
    } catch (e) {
      mostrarErro('Falha de conexão ao enviar sua resposta. Tente novamente.');
      setOrbe('idle');
      btnPtt.disabled = false;
      btnPtt.textContent = 'Toque para falar';
    }
  }

  // Push-to-talk: 1o toque grava; 2o toque envia.
  btnPtt.addEventListener('click', () => {
    if (encerrando) return;
    if (gravando) {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    } else {
      comecarGravacao();
    }
  });

  // Repetir pergunta: retoca o ultimo audio (sem nova chamada ao servidor).
  btnRepetir.addEventListener('click', () => {
    if (!gravando && ultimoAudioUrl) tocarFala(ultimoAudioUrl);
  });

  // Inicio (gesto do usuario destrava o audio no iOS).
  btnIniciar.addEventListener('click', async () => {
    overlayIniciar.hidden = true;
    // Prime o elemento de audio dentro do gesto para destravar no iOS.
    try {
      audio.muted = true;
      await audio.play().catch(() => {});
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
    } catch (e) { /* ignore */ }
    iniciarEntrevista();
  });

  window.addEventListener('pagehide', pararTudo);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && gravando && recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  });
})();
