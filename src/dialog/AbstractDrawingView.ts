import { DialogResult } from 'api/types';
import { autosave, clearAutosave } from '../autosave';
import localization from '../localization';
import {
	EditorStyle,
	ImageMetadata,
	KeybindingRecord,
	MessageType,
	ResponseType,
	SaveCompletedMessage,
	SaveMethod,
	ToolbarType,
	WebViewMessage,
	WebViewMessageResponse,
} from '../types';
import TemporaryDirectory from '../TemporaryDirectory';
import promptForImages, {
	cleanUpTaskResult,
	taskById as imagePickerTaskById,
} from '../util/promptForImages';

export type SaveCallback = (svgData: string, metadata: ImageMetadata) => void | Promise<void>;
export type SaveCallbacks =
	| {
			saveAsNew: SaveCallback;
			overwrite: SaveCallback;
	  }
	| {
			saveAsNew: null;
			overwrite: SaveCallback;
	  };

export type ButtonRecord = {
	id: string;
	title?: string;
};

export interface InsertDrawingOptions {
	initialData: string | undefined;
	saveCallbacks: SaveCallbacks;
	initialSaveMethod?: SaveMethod;
}

export type OnWebViewMessageHandler = (message: WebViewMessage) => Promise<WebViewMessageResponse>;

export default abstract class AbstractDrawingView {
	private autosaveInterval: number = 120 * 1000; // ms
	private toolbarType: ToolbarType = ToolbarType.Default;
	private styleMode: EditorStyle = EditorStyle.MatchJoplin;
	private keybindings: KeybindingRecord = Object.create(null);

	public constructor(private tempDir: TemporaryDirectory) {}

	protected abstract addScript(path: string): Promise<void>;
	protected abstract setDialogButtons(buttons: ButtonRecord[]): Promise<void>;
	protected abstract postMessage(message: WebViewMessage): void;
	protected abstract onMessage(onMessageHandler: OnWebViewMessageHandler): void;
	protected abstract showDialog(): Promise<DialogResult>;

	/** Resets the dialog prior to use. This can be called multiple times. */
	protected async initializeDialog() {
		// Sometimes, the dialog doesn't load properly.
		// Add a cancel button to hide it and try loading again.
		await this.setDialogButtons([{ id: 'cancel' }]);

		// Script path is from the root of the plugin directory
		await this.addScript('./dialog/webview/webview.js');
		await this.addScript('./dialog/webview/webview.css');
	}

	/** Sets the autosave interval in milliseconds. Takes effect on the next editor launch. */
	public async setAutosaveInterval(interval: number) {
		this.autosaveInterval = interval;
	}

	/** Sets the toolbar to be displayed in the dialog. Takes effect on the next editor launch. */
	public setToolbarType(type: ToolbarType) {
		this.toolbarType = type;
	}

	/** Changes the editor's style. Takes effect on the next launch of the editor. */
	public setStyleMode(style: EditorStyle) {
		this.styleMode = style;
	}

	/** Sets the keyboard shortcuts. Takes effect when the editor is next launched. */
	public setKeyboardShortcuts(keybindings: KeybindingRecord) {
		for (const id in keybindings) {
			this.keybindings[id] = [...keybindings[id]];
		}
	}

	/**
	 * Displays a dialog that allows the user to insert a drawing.
	 *
	 * @returns true if the drawing was saved at least once.
	 */
	public async promptForDrawing(options: InsertDrawingOptions): Promise<boolean> {
		await this.initializeDialog();

		let saveOption: SaveMethod | null = options.initialSaveMethod ?? null;
		let didSave = false;

		if (!options.saveCallbacks.saveAsNew) {
			saveOption = SaveMethod.Overwrite;
		}

		const save = async (data: string, metadata: ImageMetadata) => {
			try {
				if (saveOption === SaveMethod.SaveAsNew) {
					if (options.saveCallbacks.saveAsNew) {
						await options.saveCallbacks.saveAsNew(data, metadata);
					} else {
						throw new Error('saveAsNew save callback not defined');
					}
				} else if (saveOption === SaveMethod.Overwrite) {
					await options.saveCallbacks.overwrite(data, metadata);
				} else {
					throw new Error('saveOption must be either saveAsNew or overwrite');
				}

				this.postMessage({
					type: MessageType.SaveCompleted,
				} as SaveCompletedMessage);

				didSave = true;
			} catch (error) {
				console.error('js-draw', error);
				alert('Not saved: ' + error);
			}
		};

		const result = new Promise<boolean>((resolve, reject) => {
			type SaveData = { svgData: string; metadata: ImageMetadata };
			let saveData: SaveData | null = null;
			this.onMessage(async (message: WebViewMessage): Promise<WebViewMessageResponse> => {
				if (message.type === 'saveSVG' && !saveOption) {
					saveData = {
						svgData: message.data,
						metadata: message.metadata,
					};

					this.setDialogButtons([
						{
							id: 'ok',
							title: localization.saveAndClose,
						},
					]);

					return {
						type: ResponseType.SaveResponse,
						waitingForSaveType: true,
					};
				} else if (message.type === 'saveSVG' && saveOption) {
					void save(message.data, message.metadata);
					saveData = null;

					return {
						type: ResponseType.SaveResponse,
						waitingForSaveType: false,
					};
				} else if (message.type === MessageType.SetSaveMethod) {
					saveOption = message.method;
				} else if (message.type === MessageType.GetInitialData) {
					// The drawing dialog has loaded -- we don't need the exit button.
					this.setDialogButtons([]);

					return {
						type: ResponseType.InitialDataResponse,

						autosaveIntervalMS: this.autosaveInterval,
						toolbarType: this.toolbarType,
						initialData: options.initialData,
						styleMode: this.styleMode,
						keyboardShortcuts: this.keybindings,
					};
				} else if (message.type === MessageType.ShowCloseButton) {
					this.setDialogButtons([
						{
							id: message.isSaved ? 'ok' : 'cancel',
							title: message.isSaved ? localization.close : localization.discardChanges,
						},
					]);
				} else if (message.type === MessageType.HideButtons) {
					this.setDialogButtons([]);
					saveData = null;
				} else if (message.type === MessageType.AutosaveSVG) {
					void clearAutosave().then(() => {
						void autosave(message.data);
					});
				} else if (message.type === MessageType.ShowImagePicker) {
					const task = promptForImages(this.tempDir);

					return {
						type: ResponseType.ImagePickerTaskResponse,
						taskId: task.id,
					};
				} else if (message.type === MessageType.CancelImagePicker) {
					const task = imagePickerTaskById(message.taskId);
					if (task) task.cancel();

					return true;
				} else if (message.type === MessageType.GetImagePickerResult) {
					const task = imagePickerTaskById(message.taskId);
					if (task) {
						const images = await task.task;
						return {
							type: ResponseType.ImagePickerResponse,
							images,
						};
					} else {
						throw new Error(`No such task: ${message.taskId}`);
					}

					return true;
				} else if (message.type === MessageType.CleanUpImagePickerResult) {
					cleanUpTaskResult(message.taskId);
					return true;
				}

				return true;
			});

			this.showDialog().then(async (result: DialogResult) => {
				if (saveData && result.id === 'ok') {
					saveOption ??= result.formData?.saveOptions?.saveOption ?? SaveMethod.SaveAsNew;
					await save(saveData.svgData, saveData.metadata);
					resolve(true);
				} else if (!saveData || result.id === 'cancel') {
					resolve(didSave);
				} else {
					reject(`Unknown button ID ${result.id}`);
				}
			});
		});
		return await result;
	}
}
