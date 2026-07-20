import { marked } from 'marked';

export class DocsViewer {
    private modal: HTMLElement;
    private contentBody: HTMLElement;
    private title: HTMLElement;
    private currentDocName: string = '';
    private currentRawContent: string = '';

    constructor() {
        this.modal = document.getElementById('docs-modal')!;
        this.contentBody = document.getElementById('docs-content')!;
        this.title = document.getElementById('docs-modal-title')!;

        const btnClose = document.getElementById('btn-close-docs')!;
        const btnCopy = document.getElementById('btn-copy-docs')!;
        const btnExport = document.getElementById('btn-export-docs')!;

        btnClose.addEventListener('click', () => this.hide());
        
        btnCopy.addEventListener('click', async () => {
            if (!this.currentRawContent) return;
            try {
                await navigator.clipboard.writeText(this.currentRawContent);
                const originalText = btnCopy.textContent;
                btnCopy.textContent = 'COPIED!';
                setTimeout(() => { btnCopy.textContent = originalText; }, 2000);
            } catch (err) {
                console.error('Failed to copy', err);
            }
        });

        btnExport.addEventListener('click', async () => {
            if (!this.currentRawContent) return;
            try {
                const res = await window.api.exportDoc(this.currentDocName, this.currentRawContent);
                if (res.success) {
                    const originalText = btnExport.textContent;
                    btnExport.textContent = 'EXPORTED!';
                    setTimeout(() => { btnExport.textContent = originalText; }, 2000);
                }
            } catch (err) {
                console.error('Failed to export', err);
            }
        });
    }

    public async openDocument(docName: string, displayTitle: string) {
        this.title.textContent = displayTitle;
        this.currentDocName = docName;
        this.contentBody.innerHTML = '<p>Loading...</p>';
        this.modal.classList.remove('hidden');

        try {
            const res = await window.api.readDoc(docName);
            if (res.success && res.content) {
                this.currentRawContent = res.content;
                this.contentBody.innerHTML = marked.parse(res.content) as string;
            } else {
                this.contentBody.innerHTML = `<p style="color:red">Failed to load document: ${res.error}</p>`;
                this.currentRawContent = '';
            }
        } catch (err: any) {
            this.contentBody.innerHTML = `<p style="color:red">Error: ${err.message}</p>`;
            this.currentRawContent = '';
        }
    }

    public hide() {
        this.modal.classList.add('hidden');
    }
}
