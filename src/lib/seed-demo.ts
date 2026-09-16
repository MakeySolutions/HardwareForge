import { db } from "./db";

/**
 * Ukazkovy projekt pri prvom spusteni, aby appka nebola prazdna.
 * Vola sa len pre uplne novu databazu (instrumentation.ts) - ked si ho
 * pouzivatel zmaze, uz sa nevrati.
 */
export async function seedDemoProject() {
  const slug = "spotify-display-with-esp32";
  if (await db.project.findUnique({ where: { slug } })) return;

  const project = await db.project.create({
    data: {
      slug,
      title: "Spotify display with ESP32",
      description:
        "Sample project — feel free to delete it. A display showing the currently playing Spotify track: an ESP32 connects to Wi-Fi, pulls data from the Web API, and renders it on a TFT display inside a 3D-printed case.",
      category: "ESP32",
      status: "DEVELOPMENT",
      priority: "HIGH",
      color: "#34d399",
    },
  });

  await db.task.createMany({
    data: [
      { projectId: project.id, title: "Study the Spotify Web API", status: "DONE", priority: "MEDIUM", order: 1024, completedAt: new Date() },
      { projectId: project.id, title: "Order an ILI9341 display", status: "DONE", priority: "HIGH", order: 2048, completedAt: new Date() },
      { projectId: project.id, title: "Wire the display to the ESP32", status: "IN_PROGRESS", priority: "HIGH", order: 1024 },
      { projectId: project.id, title: "Solder the connectors", status: "IN_PROGRESS", priority: "CRITICAL", order: 2048 },
      { projectId: project.id, title: "Waiting on an AliExpress shipment", status: "WAITING", priority: "LOW", order: 1024 },
      { projectId: project.id, title: "Test token refresh", status: "TESTING", priority: "MEDIUM", order: 1024 },
      { projectId: project.id, title: "Design the case in Fusion", status: "TODO", priority: "MEDIUM", order: 1024 },
      { projectId: project.id, title: "Print the case", status: "TODO", priority: "LOW", order: 2048 },
    ],
  });

  await db.part.createMany({
    data: [
      { projectId: project.id, name: "ESP32-WROOM-32", category: "MCU", partNumber: "ESP32-WROOM-32E", quantity: 1, unitPrice: "4.20", voltage: "5", currentMa: "240", acquired: true, shopUrl: "https://www.aliexpress.com/" },
      { projectId: project.id, name: "2.8\" TFT display ILI9341", category: "DISPLAY", partNumber: "ILI9341", quantity: 1, unitPrice: "8.90", voltage: "3.3", currentMa: "90", acquired: true },
      { projectId: project.id, name: "WS2812B strip 1 m / 60 LEDs", category: "LED", quantity: 2, unitPrice: "6.50", voltage: "5", currentMa: "900" },
      { projectId: project.id, name: "5 V / 3 A power supply", category: "POWER", quantity: 1, unitPrice: "7.90" },
      { projectId: project.id, name: "PETG filament, black, 1 kg", category: "MECHANICAL", quantity: 1, unitPrice: "19.90" },
      { projectId: project.id, name: "Dupont cables 20 cm", category: "CABLE", quantity: 1, unitPrice: "2.40", acquired: true },
    ],
  });

  await db.link.createMany({
    data: [
      { projectId: project.id, title: "Spotify Web API — documentation", url: "https://developer.spotify.com/documentation/web-api", type: "DOCS" },
      { projectId: project.id, title: "TFT_eSPI library", url: "https://github.com/Bodmer/TFT_eSPI", type: "GITHUB" },
      { projectId: project.id, title: "ILI9341 datasheet", url: "https://cdn-shop.adafruit.com/datasheets/ILI9341.pdf", type: "DATASHEET" },
    ],
  });

  await db.note.create({
    data: {
      projectId: project.id,
      title: "Pinout",
      pinned: true,
      content: `# ILI9341 -> ESP32 wiring

| Display | ESP32   |
|---------|---------|
| VCC     | 3V3     |
| GND     | GND     |
| CS      | GPIO 15 |
| RESET   | GPIO 4  |
| DC      | GPIO 2  |
| MOSI    | GPIO 23 |
| SCK     | GPIO 18 |
| LED     | 3V3     |

## Checklist before soldering

- [x] Check power polarity
- [ ] Test on a breadboard first
- [ ] Cut cables to length

\`\`\`cpp
#include <TFT_eSPI.h>

TFT_eSPI tft = TFT_eSPI();

void setup() {
  tft.init();
  tft.setRotation(1);
  tft.fillScreen(TFT_BLACK);
}
\`\`\`

> Careful: LED strips draw noticeably more at full brightness than the
> estimate suggests — budget ~60 mA per LED at white.
`,
    },
  });

  await db.activityLog.create({
    data: {
      projectId: project.id,
      type: "PROJECT_CREATED",
      message: 'Created project "Spotify display with ESP32"',
    },
  });
}
