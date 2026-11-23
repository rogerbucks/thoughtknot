// What the phone app says about AI, in UK English (ES§19, app_ai_host to app_ai_on_device; ES§42, words_catalogue):
// its group in the More view, the send sheet, and the record of sends. source-words.ts keeps these with every other
// word, through app-source-words.ts.

/** The phone's AI words, by key, in UK English. */
export const APP_AI_SOURCE_WORDS = {
  // the AI group in the More view (app_ai_settings)
  'app.ai.title': 'AI',
  'app.ai.intro':
    'AI is off until you turn it on. A note goes to a model only when you tap Send, after you have seen exactly what will go.',
  'app.ai.use': 'Use AI',
  'app.ai.on': 'On',
  'app.ai.off': 'Off',
  'app.ai.unlabelled': 'A note with no classification counts as',
  'app.ai.ceiling': 'The highest classification it may be sent',
  'app.ai.purpose': 'What it is for',
  'app.ai.reach': 'Whose model it is',
  'app.ai.reach.private': 'Private: a model you run',
  'app.ai.reach.public': 'Public: a cloud model',
  'app.ai.reach.public-off':
    'A public model is sent nothing from this iPhone yet. Mark it private if you run it yourself, such as on your tailnet.',
  'app.ai.address': 'Its address: {address}',
  'app.ai.key': 'Its key',
  'app.ai.key.keep': 'Keep the key',
  'app.ai.key.forget': 'Forget the key',
  'app.ai.key.kept': 'A key is kept for it in this iPhone’s Keychain.',
  'app.ai.key.none': 'No key is kept for it. A model you run may need none.',
  'app.ai.key.where':
    'A key is kept in this iPhone’s Keychain only: never in your notes, the app’s settings or anything that syncs.',
  'app.ai.key.empty': 'Paste the key first.',
  'app.ai.key.failed': 'The key was not kept: {why}',
  'app.ai.test': 'Test {name}',
  'app.ai.test.said': '{answer} No note was sent.',
  'app.ai.remove': 'Remove {name}',
  'app.ai.add.title': 'Add a model',
  'app.ai.add.name': 'Its name',
  'app.ai.add.address': 'Its address, such as https://my-mac.tailnet.ts.net/v1',
  'app.ai.add.model': 'The model’s id, as its service names it',
  'app.ai.add': 'Add the model',
  'app.ai.add.no-name': 'Give the model a name.',
  'app.ai.add.no-model': 'Give the model’s id, as its service names it.',
  'app.ai.add.taken': 'A model is already called {name}.',
  'app.ai.added': '{name} is added, as a public model: mark it private if you run it.',
  // the phone's own model (app_ai_on_device)
  'app.ai.on-device.name': 'This iPhone',
  'app.ai.on-device.address': 'this iPhone itself',
  'app.ai.on-device.said':
    'Apple’s model on this iPhone, offered first. It is private: a note sent to it never leaves the phone.',
  // the send sheet (app_ai_send_sheet)
  'app.ai.sheet.title': 'Send to an AI model?',
  'app.ai.sheet.model': 'The model to send to',
  'app.ai.sheet.exactly': 'Exactly what will be sent',
  'app.ai.sheet.to': 'To {model}, at {address}',
  'app.ai.sheet.sending': 'Sending to {model}…',
  'app.ai.sheet.no-model': 'No model may be sent this. Turn AI on and add a model in More.',
  'app.ai.sheet.no-board': 'The model sent back no board.',
  // the record of sends (app_ai_record)
  'app.ai.record.title': { one: 'Sends from this iPhone: {count}', other: 'Sends from this iPhone: {count}' },
  'app.ai.record.where':
    'Kept on this iPhone only, never in your notes or anything that syncs. What was sent is not kept: only its size and fingerprint.',
  'app.ai.record.none': 'Nothing has been sent from this iPhone.',
  'app.ai.record.line': '{at}: {model} at {to}, {size} bytes, {outcome}',
  'app.ai.record.answered': 'answered',
  'app.ai.record.failed': 'failed',
  'app.ai.record.digest': 'SHA-256 of what was sent: {digest}',
} as const;
