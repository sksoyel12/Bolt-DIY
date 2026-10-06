import type { Message } from 'ai';
import { generateId } from './fileUtils';
import { detectProjectCommands, createCommandsMessage, escapeBoltTags } from './projectCommands';

export interface ImportedTextFile {
  path: string;
  content: string;
}

function normalizeArtifactPath(filePath: string): string {
  return filePath
    .replace(/\\/g, '/')
    .replace(/[\u0000-\u001f"<>]/g, '')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

export const createChatFromArtifacts = async (
  importedFiles: ImportedTextFile[],
  skippedFiles: string[],
  folderName: string,
): Promise<Message[]> => {
  const fileArtifacts = importedFiles
    .map((file) => ({ ...file, path: normalizeArtifactPath(file.path) }))
    .filter((file) => file.path);
  const commands = await detectProjectCommands(fileArtifacts);
  const commandsMessage = createCommandsMessage(commands);

  const skippedFilesMessage =
    skippedFiles.length > 0
      ? `\n\nSkipped ${skippedFiles.length} files:\n${skippedFiles.map((file) => `- ${file}`).join('\n')}`
      : '';

  const filesMessage: Message = {
    role: 'assistant',
    content: `I've imported the contents of "${folderName}".${skippedFilesMessage}

<boltArtifact id="imported-files" title="Imported Files" type="bundled">
${fileArtifacts
  .map(
    (file) => `<boltAction type="file" filePath="${file.path}">
${escapeBoltTags(file.content)}
</boltAction>`,
  )
  .join('\n\n')}
</boltArtifact>`,
    id: generateId(),
    createdAt: new Date(),
  };

  const messages: Message[] = [
    {
      role: 'user',
      id: generateId(),
      content: `Import the "${folderName}" project`,
      createdAt: new Date(),
    },
    filesMessage,
  ];

  if (commandsMessage) {
    messages.push({
      role: 'user',
      id: generateId(),
      content: 'Setup the codebase and Start the application',
      createdAt: new Date(),
    });
    messages.push(commandsMessage);
  }

  return messages;
};

export const createChatFromFolder = async (
  files: File[],
  binaryFiles: string[],
  folderName: string,
): Promise<Message[]> => {
  const fileArtifacts = await Promise.all(
    files.map(async (file) => {
      return new Promise<{ content: string; path: string }>((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          const content = reader.result as string;
          const relativePath = file.webkitRelativePath.split('/').slice(1).join('/') || file.name;
          resolve({
            content,
            path: relativePath,
          });
        };
        reader.onerror = reject;
        reader.readAsText(file);
      });
    }),
  );

  return createChatFromArtifacts(fileArtifacts, binaryFiles, folderName);
};
