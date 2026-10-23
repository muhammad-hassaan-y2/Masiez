import { Camera } from '../scene/Camera';
import { TankTarget } from '../gpu/TankRenderer';
import { ScreenBox, projectTankBoxes } from './Annotations';

export class AnnotationOverlay {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private targetMode = false;
    private selectedIndex = -1;
    private pointerX = 0;
    private pointerY = 0;
    private pointerActive = false;
    private boxes: ScreenBox[] = [];
    private dpr = 1;
    private viewWidth = 0;
    private viewHeight = 0;

    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'annotation-overlay';
        this.canvas.style.cssText = `
            position:absolute;inset:0;width:100%;height:100%;
            pointer-events:none;z-index:5;
        `;
        document.body.appendChild(this.canvas);

        const ctx = this.canvas.getContext('2d');
        if (!ctx) throw new Error('2D canvas context unavailable');
        this.ctx = ctx;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    public setTargetMode(active: boolean): void {
        this.targetMode = active;
    }

    public setPointer(x: number, y: number, active: boolean): void {
        this.pointerX = x;
        this.pointerY = y;
        this.pointerActive = active;
    }

    public setSelectedIndex(index: number): void {
        this.selectedIndex = index;
    }

    public hitTest(x: number, y: number): number | undefined {
        let match: ScreenBox | undefined;
        for (const box of this.boxes) {
            const inside = x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
            if (!inside) continue;
            if (!match || box.width * box.height < match.width * match.height) {
                match = box;
            }
        }
        if (!match) return undefined;
        return match.tankIndex;
    }

    private resize(): void {
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.viewWidth = Math.max(1, window.innerWidth);
        this.viewHeight = Math.max(1, window.innerHeight);
        this.canvas.width = Math.max(1, Math.round(this.viewWidth * this.dpr));
        this.canvas.height = Math.max(1, Math.round(this.viewHeight * this.dpr));
    }

    public draw(camera: Camera, targets: TankTarget[]): void {
        const ctx = this.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.boxes = [];
        if (!this.targetMode) return;

        const boxes = projectTankBoxes(camera, targets, this.viewWidth, this.viewHeight);
        this.boxes = boxes;
        const hoveredIndex = this.pointerActive ? this.hitTest(this.pointerX, this.pointerY) : undefined;

        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.font = '600 11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
        ctx.textBaseline = 'top';

        for (const box of boxes) {
            const selected = box.tankIndex === this.selectedIndex;
            const hovered = box.tankIndex === hoveredIndex;
            ctx.lineWidth = selected || hovered ? 2.5 : 1.5;
            ctx.strokeStyle = selected
                ? 'rgba(255,120,90,1)'
                : this.targetMode
                    ? 'rgba(255,196,110,0.95)'
                    : 'rgba(120,255,170,0.95)';
            ctx.strokeRect(box.x, box.y, box.width, box.height);

            const label = selected
                ? `LOCKED ${String(box.tankIndex).padStart(2, '0')}`
                : `TANK ${String(box.tankIndex).padStart(2, '0')}`;
            const labelWidth = ctx.measureText(label).width + 8;
            const labelY = box.y >= 17 ? box.y - 17 : box.y;
            ctx.fillStyle = selected ? 'rgba(60,16,10,0.85)' : 'rgba(6,18,12,0.78)';
            ctx.fillRect(box.x, labelY, labelWidth, 16);
            ctx.fillStyle = selected
                ? 'rgba(255,170,140,1)'
                : this.targetMode
                    ? 'rgba(255,214,150,1)'
                    : 'rgba(140,255,190,0.98)';
            ctx.fillText(label, box.x + 4, labelY + 3);
        }
    }
}
