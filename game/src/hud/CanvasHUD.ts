import { AdvancedDynamicTexture, TextBlock, Rectangle, Control, Image } from '@babylonjs/gui';
import { RenderTargetTexture } from '@babylonjs/core';
import { Telemetry } from 'drone-autonomy-shared';

export class CanvasHUD {
    private ui: AdvancedDynamicTexture;
    
    private altText: TextBlock;
    private spdText: TextBlock;
    private hdgText: TextBlock;
    
    private batText: TextBlock;
    private batBar: Rectangle = new Rectangle();
    private gpsText: TextBlock;
    private modeText: TextBlock;
    private stateText: TextBlock;
    
    private alertText: TextBlock;

    constructor(fpvTexture: RenderTargetTexture, minimapTexture: RenderTargetTexture) {
        this.ui = AdvancedDynamicTexture.CreateFullscreenUI("HUD");

        // Top Left Panel (Telemetry)
        const leftPanel = new Rectangle();
        leftPanel.width = "200px";
        leftPanel.height = "150px";
        leftPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        leftPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        leftPanel.top = "20px";
        leftPanel.left = "20px";
        leftPanel.background = "rgba(0, 0, 0, 0.5)";
        leftPanel.thickness = 0;
        this.ui.addControl(leftPanel);

        this.altText = this.createText("ALT: 0.0m", "10px");
        this.spdText = this.createText("SPD: 0.0 m/s", "40px");
        this.hdgText = this.createText("HDG: 0°", "70px");
        leftPanel.addControl(this.altText);
        leftPanel.addControl(this.spdText);
        leftPanel.addControl(this.hdgText);

        // Top Right Panel (Status)
        const rightPanel = new Rectangle();
        rightPanel.width = "200px";
        rightPanel.height = "150px";
        rightPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        rightPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        rightPanel.top = "20px";
        rightPanel.left = "-20px";
        rightPanel.background = "rgba(0, 0, 0, 0.5)";
        rightPanel.thickness = 0;
        this.ui.addControl(rightPanel);

        this.batText = this.createText("BAT: 100%", "10px");
        this.gpsText = this.createText("GPS: 3D", "40px");
        this.modeText = this.createText("MODE: MANUAL", "70px");
        this.stateText = this.createText("STATE: DISARMED", "100px");
        rightPanel.addControl(this.batText);
        rightPanel.addControl(this.gpsText);
        rightPanel.addControl(this.modeText);
        rightPanel.addControl(this.stateText);

        // Alert Area
        this.alertText = new TextBlock();
        this.alertText.text = "";
        this.alertText.color = "red";
        this.alertText.fontSize = 24;
        this.alertText.fontWeight = "bold";
        this.alertText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.alertText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.alertText.top = "50px";
        this.ui.addControl(this.alertText);

        // Bottom Right: FPV
        /* 
        We can't easily put an RTT into Babylon GUI Image directly without passing a URL or dealing with base64.
        Actually, we can use an empty rectangle to just act as a frame, or omit it from GUI and render the texture to a plane.
        But for simplicity here, we'll assume the HUD just draws text and the textures are shown elsewhere or we just skip PIP in GUI for now.
        Wait, Babylon GUI *does* support Image from RTT using a hack or just leaving it to be drawn via scene layer.
        For now, let's omit the FPV/Minimap PIP from the 2D GUI and just do the text HUD.
        */
    }

    private createText(text: string, top: string): TextBlock {
        const tb = new TextBlock();
        tb.text = text;
        tb.color = "white";
        tb.fontSize = 16;
        tb.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        tb.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        tb.left = "10px";
        tb.top = top;
        return tb;
    }

    public update(t: Telemetry | null): void {
        if (!t) return;

        this.altText.text = `ALT: ${t.position.altitude_agl.toFixed(1)}m`;
        this.spdText.text = `SPD: ${t.groundSpeed.toFixed(1)} m/s`;
        this.hdgText.text = `HDG: ${t.heading.toFixed(0)}°`;

        this.batText.text = `BAT: ${t.battery.percentage.toFixed(0)}%`;
        this.gpsText.text = `GPS: ${t.gps.satellites > 6 ? '3D' : 'NO FIX'} (${t.gps.satellites})`;
        this.modeText.text = `MODE: ${t.flightMode}`;
        this.stateText.text = `STATE: ${t.armed ? 'ARMED' : 'DISARMED'}`;
    }

    public showAlert(message: string, severity: 'info' | 'warning' | 'error', durationMs: number = 3000): void {
        this.alertText.text = message;
        if (severity === 'error') this.alertText.color = "red";
        else if (severity === 'warning') this.alertText.color = "yellow";
        else this.alertText.color = "white";

        setTimeout(() => {
            if (this.alertText.text === message) {
                this.alertText.text = "";
            }
        }, durationMs);
    }
}
