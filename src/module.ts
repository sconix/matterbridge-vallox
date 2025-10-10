import { Matterbridge, MatterbridgeDynamicPlatform, MatterbridgeEndpoint, fanDevice, airQualitySensor, PlatformConfig } from 'matterbridge';
import { AnsiLogger, LogLevel } from 'matterbridge/logger';
import { Identify, Groups, AirQuality, FanControl, TemperatureMeasurement, RelativeHumidityMeasurement, CarbonDioxideConcentrationMeasurement } from 'matterbridge/matter/clusters';

import { ValloxDevice, ValloxStatus } from './device.js';

/**
 * This is the standard interface for Matterbridge plugins.
 * Each plugin should export a default function that follows this signature.
 *
 * @param {Matterbridge} matterbridge - An instance of MatterBridge.
 * @param {AnsiLogger} log - An instance of AnsiLogger. This is used for logging messages in a format that can be displayed with ANSI color codes and in the frontend.
 * @param {PlatformConfig} config - The platform configuration.
 * @returns {TemplatePlatform} - An instance of the MatterbridgeAccessory or MatterbridgeDynamicPlatform class. This is the main interface for interacting with the Matterbridge system.
 */
export default function initializePlugin(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig): TemplatePlatform {
  return new TemplatePlatform(matterbridge, log, config);
}

// Here we define the TemplatePlatform class, which extends the MatterbridgeDynamicPlatform.
// If you want to create an Accessory platform plugin, you should extend the MatterbridgeAccessoryPlatform class instead.
export class TemplatePlatform extends MatterbridgeDynamicPlatform {
  aqs: MatterbridgeEndpoint | null = null;
  fan: MatterbridgeEndpoint | null = null;

  vallox: ValloxDevice | undefined = undefined;

  constructor(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig) {
    // Always call super(matterbridge, log, config)
    super(matterbridge, log, config);

    // Verify that Matterbridge is the correct version
    if (this.verifyMatterbridgeVersion === undefined || typeof this.verifyMatterbridgeVersion !== 'function' || !this.verifyMatterbridgeVersion('3.0.7')) {
      throw new Error(
        `This plugin requires Matterbridge version >= "3.0.7". Please update Matterbridge from ${this.matterbridge.matterbridgeVersion} to the latest version in the frontend."`,
      );
    }

    this.log.info(`Initializing Platform...`);
    // You can initialize your platform here, like setting up initial state or loading configurations.
  }

  override async onStart(reason?: string) {
    this.log.info(`onStart called with reason: ${reason ?? 'none'}`);

    // Wait for the platform to fully load the select
    await this.ready;

    // Clean the selectDevice and selectEntity maps, if you want to reset the select.
    await this.clearSelect();

    // Implements your own logic there
    await this.discoverDevices();

    this.vallox?.startPolling();
  }

  override async onConfigure() {
    // Always call super.onConfigure()
    await super.onConfigure();

    this.log.info('onConfigure called');

    this.vallox?.stopPolling();

    // Configure all your devices. The persisted attributes need to be updated.
    for (const device of this.getDevices()) {
      this.log.info(`Configuring device: ${device.uniqueId}`);
      // You can update the device configuration here, for example:
      // device.updateConfiguration({ key: 'value' });
    }
  }

  override async onChangeLoggerLevel(logLevel: LogLevel) {
    this.log.info(`onChangeLoggerLevel called with: ${logLevel}`);
    // Change here the logger level of the api you use or of your devices
  }

  override async onShutdown(reason?: string) {
    // Always call super.onShutdown(reason)
    await super.onShutdown(reason);

    this.log.info(`onShutdown called with reason: ${reason ?? 'none'}`);
    if (this.config.unregisterOnShutdown === true) await this.unregisterAllDevices();
  }

  private async updateValues(data: ValloxStatus) {
    this.log.info(`Received new Vallox data: ${JSON.stringify(data)}`);

    if (data.power) {
      const matterMode = await this.valloxSpeedToMatterMode(data.fanSpeed);

      this.fan?.setAttribute(FanControl.Cluster.id, 'fanMode', matterMode, this.log);

      this.fan?.setAttribute(FanControl.Cluster.id, 'percentSetting', data.fanSpeed ?? 50, this.log);

      const airQuality =
        data.carbonDioxideConcentration && data.carbonDioxideConcentration > 0
          ? data.carbonDioxideConcentration < 800
            ? AirQuality.AirQualityEnum.Good
            : data.carbonDioxideConcentration < 1200
              ? AirQuality.AirQualityEnum.Moderate
              : data.carbonDioxideConcentration < 1800
                ? AirQuality.AirQualityEnum.Poor
                : data.carbonDioxideConcentration < 2100
                  ? AirQuality.AirQualityEnum.VeryPoor
                  : AirQuality.AirQualityEnum.ExtremelyPoor
          : AirQuality.AirQualityEnum.Unknown;

      this.aqs?.setAttribute(AirQuality.Cluster.id, 'airQuality', airQuality, this.log);

      this.aqs?.setAttribute(TemperatureMeasurement.Cluster.id, 'measuredValue', (data.temperature ?? 0) * 100, this.log);

      this.aqs?.setAttribute(RelativeHumidityMeasurement.Cluster.id, 'measuredValue', (data.relativeHumidity ?? 0) * 100, this.log);

      this.aqs?.setAttribute(CarbonDioxideConcentrationMeasurement.Cluster.id, 'measuredValue', data.carbonDioxideConcentration ?? 0, this.log);
    } else {
      this.fan?.setAttribute(FanControl.Cluster.id, 'fanMode', FanControl.FanMode.Off, this.log);

      this.fan?.setAttribute(FanControl.Cluster.id, 'percentSetting', 0, this.log);

      this.aqs?.setAttribute(AirQuality.Cluster.id, 'airQuality', null, this.log);

      this.aqs?.setAttribute(TemperatureMeasurement.Cluster.id, 'measuredValue', null, this.log);

      this.aqs?.setAttribute(RelativeHumidityMeasurement.Cluster.id, 'measuredValue', null, this.log);

      this.aqs?.setAttribute(CarbonDioxideConcentrationMeasurement.Cluster.id, 'measuredValue', null, this.log);
    }

    this.fan?.setAttribute('BridgedDeviceBasicInformation', 'reachable', data.power, this.log);
    this.aqs?.setAttribute('BridgedDeviceBasicInformation', 'reachable', data.power, this.log);
  }

  private async discoverDevices() {
    this.log.info('Discovering devices...');

    if (!this.config.ip || !this.config.port) {
      return;
    }

    this.vallox = new ValloxDevice({ ip: this.config.ip as string, port: this.config.port as number }, this.updateValues.bind(this));

    const valloxInfo = await this.vallox.getBasicInfo();

    this.log.info(`Vallox Info: ${JSON.stringify(valloxInfo)}`);

    this.fan = new MatterbridgeEndpoint(fanDevice, { uniqueStorageKey: 'vallow-fan-' + valloxInfo.serial }, this.config.turnOnDebugMode as boolean)
      .createDefaultBridgedDeviceBasicInformationClusterServer(
        'Vallox Ventilation Unit',
        valloxInfo.serial,
        this.matterbridge.aggregatorVendorId,
        'Vallox',
        valloxInfo.name,
        undefined,
        valloxInfo.softwareVersion ?? 'unknown',
      )
      .createDefaultPowerSourceWiredClusterServer()
      .addClusterServers([Identify.Cluster.id, Groups.Cluster.id])
      .createBaseFanControlClusterServer(); // We dont want auto mode

    this.fan.subscribeAttribute(FanControl.Cluster.id, 'fanMode', async (newValue, oldValue, context) => {
      if (newValue === null || context.offline === true) {
        return;
      }

      const newMode = this.matterModeToValloxMode(newValue);

      await this.vallox?.changeFanMode(newMode);

      this.log.info(`Fan mode changed to: ${newValue} from ${oldValue}`);
    });
    this.fan.subscribeAttribute(FanControl.Cluster.id, 'percentSetting', async (newValue, oldValue, context) => {
      if (newValue === null || context.offline === true) {
        return;
      }

      await this.vallox?.changeFanSpeed(newValue);

      this.log.info(`Fan speed changed to: ${newValue} from ${oldValue}`);
    });

    await this.registerDevice(this.fan);

    // TODO: Add checks what sensors are actually in the unit, or is there always RH and CO2?

    this.aqs = new MatterbridgeEndpoint(airQualitySensor, { uniqueStorageKey: 'vallow-aqs-' + valloxInfo.serial }, this.config.turnOnDebugMode as boolean)
      .createDefaultBridgedDeviceBasicInformationClusterServer(
        'Vallox Air Quality Sensor',
        valloxInfo.serial,
        this.matterbridge.aggregatorVendorId,
        'Vallox',
        valloxInfo.name,
        undefined,
        valloxInfo.softwareVersion ?? 'unknown',
      )
      .createDefaultPowerSourceWiredClusterServer()
      .addRequiredClusterServers()
      .addClusterServers([TemperatureMeasurement.Cluster.id, RelativeHumidityMeasurement.Cluster.id, CarbonDioxideConcentrationMeasurement.Cluster.id]);

    await this.registerDevice(this.aqs);
  }

  private matterModeToValloxMode(mode: FanControl.FanMode): string {
    switch (mode) {
      case FanControl.FanMode.Off:
        return 'OFF';
      case FanControl.FanMode.Low:
        return 'AWAY';
      case FanControl.FanMode.Medium:
        return 'HOME';
      case FanControl.FanMode.High:
        return 'BOOST';
      default:
        return 'HOME';
    }
  }

  private async valloxSpeedToMatterMode(speed: number | undefined): Promise<FanControl.FanMode> {
    if (!speed) {
      return FanControl.FanMode.Off;
    } else {
      const valloxSpeeds = await this.vallox?.getModeSpeeds();

      const matterSpeeds = { Low: valloxSpeeds?.AWAY ?? 20, Medium: valloxSpeeds?.HOME ?? 40, High: valloxSpeeds?.BOOST ?? 60 };

      return !speed <= matterSpeeds.Low ? FanControl.FanMode.Low : speed <= matterSpeeds.Medium ? FanControl.FanMode.Medium : FanControl.FanMode.High;
    }
  }
}
