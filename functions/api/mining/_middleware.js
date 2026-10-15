import { noStoreJson } from '../../utils/http.js';

export function onRequest() {
  return noStoreJson(
    { error: 'The mining event has ended. Mining clues and submissions are closed.' },
    410
  );
}
