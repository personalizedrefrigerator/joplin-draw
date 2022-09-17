
interface AppLocalization {
	insertDrawing: string;
	restoreFromAutosave: string;
	deleteAutosave: string;
	noSuchAutosaveExists: string;
	discardChanges: string;
	defaultImageTitle: string;

	edit: string;
	close: string;
	save: string;

	overwriteExisting: string;
	saveAsNewDrawing: string;
	clickOkToContinue: string;
	discardUnsavedChanges: string;
	resumeEditing: string;
}

const defaultStrings: AppLocalization = {
	insertDrawing: 'Insert Drawing',
	restoreFromAutosave: 'Restore from autosaved drawing',
	deleteAutosave: 'Delete all autosaved drawings',
	noSuchAutosaveExists: 'No autosave exists',
	discardChanges: 'Discard changes',
	defaultImageTitle: 'Freehand Drawing',

	edit: 'Edit',
	close: 'Close',
	save: 'Save',

	overwriteExisting: 'Overwrite existing',
	saveAsNewDrawing: 'Save as a new drawing',
	clickOkToContinue: 'Done! Click “Ok” to continue.',
	discardUnsavedChanges: 'Discard unsaved changes?',
	resumeEditing: 'Resume editing',
};

const localizations: Record<string, AppLocalization> = {
	en: defaultStrings,
	es: {
		...defaultStrings,
		insertDrawing: 'Añada dibujo',
		restoreFromAutosave: 'Resturar al autoguardado',
		deleteAutosave: 'Borrar el autoguardado',
		noSuchAutosaveExists: 'No autoguardado existe',
		discardChanges: 'Descartar cambios',
		defaultImageTitle: 'Dibujo',

		edit: 'Editar',
		close: 'Cerrar',
		save: 'Guardar',

		overwriteExisting: 'Sobrescribir existente',
		saveAsNewDrawing: 'Guardar como dibujo nuevo',
		clickOkToContinue: 'Guardado. Ponga «ok» para continuar.',
		discardUnsavedChanges: '¿Descartar cambios no guardados?',
		resumeEditing: 'Continuar editando',
	}
};

let localization: AppLocalization|undefined;

const languages = [...navigator.languages];
for (const language of navigator.languages) {
	const localeSep = language.indexOf('-');

	if (localeSep !== -1) {
		languages.push(language.substring(0, localeSep));
	}
}

for (const locale of languages) {
	if (locale in localizations) {
		localization = localizations[locale];
		break;
	}
}

if (!localization) {
	console.log('No supported localization found. Falling back to default.');
	localization = defaultStrings;
}

export default localization!;
