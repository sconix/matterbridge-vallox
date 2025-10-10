import Vallox from '@danielbayerlein/vallox-api';

import { ValloxModels } from './constants.js';

export type ValloxConfig = {
  ip: string;
  port: number;
};

export type ValloxStatus = {
  fanMode?: string;
  fanSpeed?: number;
  temperature?: number;
  relativeHumidity?: number;
  carbonDioxideConcentration?: number;
};

export class ValloxDevice {
  private timer?: NodeJS.Timeout;

  private valloxService: typeof Vallox;

  private updateCallback: (data: ValloxStatus) => void;

  constructor(config: ValloxConfig, callback: (data: ValloxStatus) => void) {
    this.updateCallback = callback;

    this.valloxService = new Vallox({ ip: config.ip, port: config.port });
  }

  public stopPolling() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  public startPolling() {
    this.checkStatus();

    this.timer = setInterval(async () => {
      await this.checkStatus();
    }, 60000);
  }

  public async getBasicInfo() {
    const metrics = await this.valloxService.fetchMetrics([
      'A_CYC_MACHINE_MODEL',
      'A_CYC_SERIAL_NUMBER_LSW',
      'A_CYC_SERIAL_NUMBER_MSW',
      'A_CYC_APPL_SW_VERSION_7',
      'A_CYC_APPL_SW_VERSION_8',
      'A_CYC_APPL_SW_VERSION_9',
    ]);

    return {
      name: ValloxModels[metrics['A_CYC_MACHINE_MODEL']] ?? 'Vallox Unknown Model',
      serial: ((metrics['A_CYC_SERIAL_NUMBER_MSW'] << 16) + metrics['A_CYC_SERIAL_NUMBER_LSW']).toString(),

      softwareVersion: [metrics['A_CYC_APPL_SW_VERSION_7'] / 256, metrics['A_CYC_APPL_SW_VERSION_8'] / 256, metrics['A_CYC_APPL_SW_VERSION_9'] / 256].join('.'),
    };
  }

  public async changeMode(mode: string) {}

  public async changeFanSpeed(speed: number) {}

  private async checkStatus() {
    const metrics = await this.valloxService.fetchMetrics(['A_CYC_RH_VALUE', 'A_CYC_FAN_SPEED', 'A_CYC_CO2_SENSOR_0', 'A_CYC_TEMP_SUPPLY_AIR']);

    const profile = await this.valloxService.getProfile();

    const profiles = Object.assign({}, ...Object.entries(this.valloxService.PROFILES).map(([a, b]) => ({ [b as string]: a })));

    this.updateCallback({
      fanMode: profiles[profile] ?? 'Off',
      fanSpeed: metrics['A_CYC_FAN_SPEED'],
      temperature: metrics['A_CYC_TEMP_SUPPLY_AIR'],
      relativeHumidity: metrics['A_CYC_RH_VALUE'],
      carbonDioxideConcentration: metrics['A_CYC_CO2_SENSOR_0'],
    });
  }
}
