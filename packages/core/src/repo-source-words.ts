// The words of graphs kept in a GitHub repository, in UK English (editor spec §42 and §48). The user reads them when a
// change is refused, or when a repository or branch cannot be used. source-words.ts keeps these with every other word.

/** The words of a repository store, by key, in UK English. */
export const REPO_SOURCE_WORDS = {
  'repo.declined': 'Not sent: you chose not to send this change.',
  'repo.credential': 'Not sent: the note holds {held}. Take it out of the note first.',
  'repo.above': 'Not sent: the note is {level}, and this repository may hold notes up to {allowed} only.',
  'repo.unknown-level':
    'Not sent: the note’s classification cannot be read. Write it on one line, such as “classification: Public”.',
  'repo.bad-name': 'Not a repository’s name: “{repo}”. Write it as owner/name.',
  'repo.not-picked': 'The repository {repo} is not one you picked. Pick it in settings first.',
  'repo.no-branch': 'Choose a branch for the changes to go on.',
  'repo.main-unasked':
    'Changes would go straight onto {branch}, the main branch. Choose another branch, or say in settings that they may.',
  'repo.allowed-not-set': 'The level this repository may hold, {allowed}, is not one of your classifications.',
  'repo.pull-on-main': 'The changes are on the main branch already, so there is nothing to ask to merge.',
  'repo.pull-unsupported': 'This app cannot open a pull request. Open one on GitHub instead.',
  'repo.commit.made': 'Add {path}',
  'repo.commit.changed': 'Change {path}',
  'repo.commit.removed': 'Remove {path}',
  'repo.extract.group-blocks': 'From {path}',
  'repo.extract.group-folders': 'Folders and docs',
  'repo.extract.found-in': 'Found in a graph block in {path}.',
  'repo.extract.folder': 'The folder {folder} holds docs.',
  'repo.extract.doc': 'The doc {path} is in the repository.',
  'repo.extract.nothing': 'The repository holds nothing the graph does not have already.',
} as const;
