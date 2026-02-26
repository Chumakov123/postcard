// clown-nose.js
(function (global) {
  const MODELS_URL = '/models'; // путь к папке с моделями (можно изменить)

  let modelsLoaded = false;
  let modelsLoadingPromise = null;

  /**
   * Загружает модели face-api, если они ещё не загружены.
   * @returns {Promise<void>}
   */
  async function loadModels() {
    if (modelsLoaded) return;
    if (modelsLoadingPromise) return modelsLoadingPromise;

    modelsLoadingPromise = (async () => {
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL);
        // Прогрев моделей (опционально)
        await warmupModels();
        modelsLoaded = true;
        console.log('✅ ClownNose: модели загружены');
      } catch (error) {
        console.error('❌ ClownNose: ошибка загрузки моделей', error);
        throw error;
      } finally {
        modelsLoadingPromise = null;
      }
    })();

    return modelsLoadingPromise;
  }

  /**
   * Прогрев моделей (компиляция шейдеров) на пустом canvas.
   */
  async function warmupModels() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 64, 64);

    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 128, scoreThreshold: 0.1 });
    try {
      await faceapi.detectAllFaces(canvas, options).withFaceLandmarks();
    } catch (e) {
      // игнорируем, прогрев всё равно произошёл
    }
  }

  /**
   * Рисует красный нос на canvas по координатам носа.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} nosePositions - массив точек носа из faceapi
   * @param {Object} detectionBox - bounding box лица
   */
  function drawNose(ctx, nosePositions, detectionBox) {
    if (!nosePositions || nosePositions.length === 0) return;

    let noseX, noseY;
    if (nosePositions.length >= 5) {
      // центральная точка между ноздрями (индексы 3 и 4)
      const leftNostril = nosePositions[3];
      const rightNostril = nosePositions[4];
      noseX = (leftNostril.x + rightNostril.x) / 2;
      noseY = (leftNostril.y + rightNostril.y) / 2;
    } else {
      noseX = nosePositions[0].x;
      noseY = nosePositions[0].y;
    }

    const noseSize = detectionBox.width * 0.135;

    ctx.save();

    // основной красный круг
    ctx.beginPath();
    ctx.arc(noseX, noseY, noseSize, 0, Math.PI * 2);
    ctx.fillStyle = '#ff4444';
    ctx.shadowColor = '#990000';
    ctx.shadowBlur = 10;
    ctx.fill();

    // блик
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(noseX - noseSize * 0.2, noseY - noseSize * 0.2, noseSize * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = '#ff9999';
    ctx.fill();

    ctx.restore();
  }

  /**
   * Основная функция обработки изображения.
   * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement|File|Blob} input - изображение
   * @param {Object} options - настройки (пока не используются)
   * @returns {Promise<HTMLCanvasElement>} - canvas с наложенным носом
   */
  async function addClownNose(input, options = {}) {
    await loadModels();

    // Создаём изображение для загрузки
    const img = await createImageFromInput(input);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // Детекция лиц
    const detectionOptions = new faceapi.TinyFaceDetectorOptions({
      inputSize: 320,
      scoreThreshold: 0.3
    });

    const detections = await faceapi
      .detectAllFaces(img, detectionOptions)
      .withFaceLandmarks();

    if (detections.length === 0) {
      console.warn('ClownNose: лица не найдены');
      return canvas; // возвращаем оригинал
    }

    // Рисуем носы поверх изображения
    detections.forEach(detection => {
      const landmarks = detection.landmarks;
      const nosePositions = landmarks.getNose();
      drawNose(ctx, nosePositions, detection.detection.box);
    });

    return canvas;
  }

  /**
   * Вспомогательная функция для создания HTMLImageElement из различных источников.
   */
  function createImageFromInput(input) {
    return new Promise((resolve, reject) => {
      if (input instanceof HTMLImageElement) {
        if (input.complete) resolve(input);
        else input.onload = () => resolve(input);
      } else if (input instanceof HTMLVideoElement) {
        // Для видео берём текущий кадр
        const canvas = document.createElement('canvas');
        canvas.width = input.videoWidth;
        canvas.height = input.videoHeight;
        canvas.getContext('2d').drawImage(input, 0, 0);
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = canvas.toDataURL();
      } else if (input instanceof HTMLCanvasElement) {
        // Для canvas создаём изображение из его содержимого
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = input.toDataURL();
      } else if (input instanceof File || input instanceof Blob) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(input);
      } else {
        reject(new Error('Unsupported input type'));
      }
    });
  }

  // Экспортируем API
  global.ClownNose = {
    loadModels,
    addClownNose,
  };
})(window);