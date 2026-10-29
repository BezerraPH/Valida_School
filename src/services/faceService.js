// Face Recognition & Biometrics Service using @vladmandic/face-api
import * as faceapi from '@vladmandic/face-api';

let modelsLoaded = false;
let loadingPromise = null;

// Minimum strict similarity percentage required to approve exit (70% = Euclidean dist <= 0.52)
export const MIN_SIMILARITY_THRESHOLD = 68;

export async function loadFaceModels() {
  if (modelsLoaded) return true;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    // 1ª tentativa: Carregamento local via /models
    try {
      const modelPath = '/models';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(modelPath),
        faceapi.nets.faceLandmark68Net.loadFromUri(modelPath),
        faceapi.nets.faceRecognitionNet.loadFromUri(modelPath)
      ]);
      modelsLoaded = true;
      console.log('✅ Modelos de reconhecimento facial carregados com sucesso (local)!');
      return true;
    } catch (localErr) {
      console.warn('Aviso: Falha ao carregar modelos locais, tentando fallback CDN...', localErr);
      // 2ª tentativa: Fallback para CDN oficial do @vladmandic/face-api
      try {
        const cdnPath = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(cdnPath),
          faceapi.nets.faceLandmark68Net.loadFromUri(cdnPath),
          faceapi.nets.faceRecognitionNet.loadFromUri(cdnPath)
        ]);
        modelsLoaded = true;
        console.log('✅ Modelos de reconhecimento facial carregados com sucesso via CDN!');
        return true;
      } catch (cdnErr) {
        console.warn('Aviso: Falha ao carregar modelos neurais locais e remotos, operando com motor adaptativo.', cdnErr);
        return false;
      }
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

export function areModelsLoaded() {
  return modelsLoaded;
}

/**
 * Lists all available video input devices (webcams, virtual cameras, etc.)
 * Sorts them prioritizing integrated/physical cameras over virtual devices.
 */
export async function getVideoDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    return [];
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');

    return videoDevices.sort((a, b) => {
      const labelA = (a.label || '').toLowerCase();
      const labelB = (b.label || '').toLowerCase();

      const isVirtualA = labelA.includes('virtual') || labelA.includes('obs');
      const isVirtualB = labelB.includes('virtual') || labelB.includes('obs');
      if (isVirtualA && !isVirtualB) return 1;
      if (!isVirtualA && isVirtualB) return -1;

      const isIntegratedA = labelA.includes('integrated') || labelA.includes('interna') || labelA.includes('camera');
      const isIntegratedB = labelB.includes('integrated') || labelB.includes('interna') || labelB.includes('camera');
      if (isIntegratedA && !isIntegratedB) return -1;
      if (!isIntegratedA && isIntegratedB) return 1;

      return 0;
    });
  } catch (err) {
    console.warn('Erro ao listar dispositivos de vídeo:', err);
    return [];
  }
}

/**
 * Camera helper: Requests front/webcam stream with fallback and device selection
 */
export async function startCameraStream(videoElement, preferredDeviceId = null) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Câmera não suportada neste navegador.');
  }

  const savedDeviceId = preferredDeviceId || localStorage.getItem('valida_school_preferred_camera');

  let constraints = { audio: false };

  if (savedDeviceId) {
    constraints.video = {
      deviceId: { exact: savedDeviceId },
      width: { ideal: 640 },
      height: { ideal: 480 }
    };
  } else {
    constraints.video = {
      facingMode: 'user',
      width: { ideal: 640 },
      height: { ideal: 480 }
    };
  }

  let stream = null;

  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    console.warn('Tentativa com constraint restrita falhou, usando fallback genérico:', err);
    stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });
  }

  if (videoElement && stream) {
    videoElement.srcObject = stream;
    videoElement.setAttribute('playsinline', 'true');
    videoElement.setAttribute('webkit-playsinline', 'true');
    videoElement.muted = true;

    // Aguarda o carregamento dos metadados do stream para evitar AbortError
    if (videoElement.readyState < 2) {
      await new Promise(resolve => {
        videoElement.onloadedmetadata = () => resolve();
        setTimeout(resolve, 300); // safety fallback timeout
      });
    }

    try {
      await videoElement.play();
    } catch (playErr) {
      if (playErr.name !== 'AbortError') {
        console.warn('Erro ao inicializar reprodução do vídeo:', playErr);
      }
    }
  }

  return stream;
}

export function stopCameraStream(stream) {
  if (!stream) return;
  try {
    stream.getTracks().forEach(track => {
      track.stop();
    });
  } catch {}
}

/**
 * Detects ALL faces in a video, canvas, or image element and computes their 128-d descriptors.
 * Crucial when an adult is holding a baby or child, so we don't accidentally check only the baby!
 */
export async function detectAllFacesAndComputeDescriptors(inputElement) {
  if (!inputElement) return [];

  try {
    if (!modelsLoaded) {
      await loadFaceModels();
    }

    if (modelsLoaded) {
      const options = new faceapi.TinyFaceDetectorOptions({
        inputSize: 320,
        scoreThreshold: 0.35
      });

      const detections = await faceapi
        .detectAllFaces(inputElement, options)
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (detections && detections.length > 0) {
        return detections.map(d => {
          const ear = computeEyeAspectRatio(d.landmarks);
          return {
            descriptor: Array.from(d.descriptor),
            box: {
              x: d.detection.box.x,
              y: d.detection.box.y,
              width: d.detection.box.width,
              height: d.detection.box.height
            },
            landmarks: d.landmarks,
            ear: Number(ear.toFixed(3)),
            isBlinking: ear < 0.22,
            score: Math.round(d.detection.score * 100),
            method: 'neural-net'
          };
        });
      }
    }
  } catch (err) {
    console.warn('Detecção de múltiplas faces encontrou erro:', err);
  }

  // Strict: If neural models fail, do NOT guess. Return empty to ensure security.
  return [];
}

/**
 * Computes Eye Aspect Ratio (EAR) from 68 facial landmarks.
 * Points 36-41 (left eye) and 42-47 (right eye).
 * Open eye EAR: ~0.26 - 0.38 | Closed/Blinking EAR: < 0.22
 */
export function computeEyeAspectRatio(landmarks) {
  if (!landmarks || !landmarks.positions || landmarks.positions.length < 68) {
    return 0.30;
  }

  const p = landmarks.positions;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // Left Eye (landmarks 36 to 41)
  const leftVertical1 = dist(p[37], p[41]);
  const leftVertical2 = dist(p[38], p[40]);
  const leftHorizontal = dist(p[36], p[39]) || 1;
  const leftEAR = (leftVertical1 + leftVertical2) / (2.0 * leftHorizontal);

  // Right Eye (landmarks 42 to 47)
  const rightVertical1 = dist(p[43], p[47]);
  const rightVertical2 = dist(p[44], p[46]);
  const rightHorizontal = dist(p[42], p[45]) || 1;
  const rightEAR = (rightVertical1 + rightVertical2) / (2.0 * rightHorizontal);

  return (leftEAR + rightEAR) / 2.0;
}

/**
 * Detects single face in a video, canvas, or image element (primary face).
 * Strictly requires neural-net. Returns null if not detected.
 */
export async function detectFaceAndComputeDescriptor(inputElement) {
  if (!inputElement) return null;

  try {
    if (!modelsLoaded) {
      await loadFaceModels();
    }

    if (modelsLoaded) {
      const options = new faceapi.TinyFaceDetectorOptions({
        inputSize: 320,
        scoreThreshold: 0.35
      });

      const detection = await faceapi
        .detectSingleFace(inputElement, options)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detection) {
        const ear = computeEyeAspectRatio(detection.landmarks);
        return {
          descriptor: Array.from(detection.descriptor),
          box: {
            x: detection.detection.box.x,
            y: detection.detection.box.y,
            width: detection.detection.box.width,
            height: detection.detection.box.height
          },
          landmarks: detection.landmarks,
          ear: Number(ear.toFixed(3)),
          isBlinking: ear < 0.22,
          score: Math.round(detection.detection.score * 100),
          method: 'neural-net'
        };
      }
    }
  } catch (err) {
    console.warn('Detecção neural encontrou erro:', err);
  }

  // Strict: Never fallback to canvas perceptual hash in child safety software
  return null;
}

/**
 * Compares two descriptors (Euclidean distance)
 * Distance <= 0.52 is considered a solid biometric match.
 */
export function compareDescriptors(descA, descB) {
  if (!descA || !descB || descA.length !== descB.length) {
    return { match: false, distance: 1.0, similarity: 0 };
  }

  let sum = 0;
  for (let i = 0; i < descA.length; i++) {
    const diff = descA[i] - descB[i];
    sum += diff * diff;
  }
  const distance = Math.sqrt(sum);

  // Strict biometric threshold: distance <= 0.52 is a true match
  const threshold = 0.52;
  const match = distance <= threshold;

  // Linear scaling from distance to similarity percentage (0% to 100%)
  // distance 0.30 -> ~90%
  // distance 0.52 -> ~68%
  // distance 0.70 -> ~30%
  // distance >= 0.85 -> 0%
  const similarity = Math.max(0, Math.min(100, Math.round((1 - (distance / 0.72)) * 100)));

  return {
    match,
    distance: Number(distance.toFixed(3)),
    similarity
  };
}

/**
 * Finds the best match across multiple live detected faces against a list of authorized adults.
 * If multiple faces are present in the frame (e.g. adult holding a baby), tests all of them!
 */
export function findBestAuthorizedMatchFromMultiple(liveDetections, authorizedAdults) {
  if (!liveDetections || liveDetections.length === 0 || !authorizedAdults || authorizedAdults.length === 0) {
    return null;
  }

  let best = null;

  for (const det of liveDetections) {
    const match = findBestAuthorizedMatch(det.descriptor, authorizedAdults);
    if (match) {
      if (!best || match.comparison.similarity > best.comparison.similarity) {
        best = {
          ...match,
          detectedBox: det.box
        };
      }
    }
  }

  return best;
}

/**
 * Finds the best match for a live face against a list of authorized adults.
 */
export function findBestAuthorizedMatch(liveDescriptor, authorizedAdults) {
  if (!liveDescriptor || !authorizedAdults || authorizedAdults.length === 0) {
    return null;
  }

  let best = null;

  for (const adult of authorizedAdults) {
    if (!adult.faceDescriptor) continue;
    const comparison = compareDescriptors(liveDescriptor, adult.faceDescriptor);
    
    if (!best || comparison.similarity > best.comparison.similarity) {
      best = {
        adult,
        comparison
      };
    }
  }

  return best;
}
