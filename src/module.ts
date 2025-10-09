import { Matterbridge, MatterbridgeDynamicPlatform, MatterbridgeEndpoint, fanDevice, airQualitySensor, PlatformConfig } from 'matterbridge';
import { AnsiLogger, LogLevel } from 'matterbridge/logger';
import { TemperatureMeasurement, RelativeHumidityMeasurement, CarbonDioxideConcentrationMeasurement } from 'matterbridge/matter/clusters';

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
  vallox: ValloxDevice | null = null;

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
    this.log.info('Received new Vallox data:', data);
  }

  private async discoverDevices() {
    this.log.info('Discovering devices...');

    if (!this.config.ip || !this.config.port) {
      return;
    }

    this.vallox = new ValloxDevice({ ip: this.config.ip as string, port: this.config.port as number }, this.updateValues.bind(this));

    const valloxInfo = await this.vallox.getBasicInfo();

    this.log.info('Vallox Info:', valloxInfo);

    const fan = new MatterbridgeEndpoint(fanDevice, { uniqueStorageKey: 'vallow-fan-' + valloxInfo.serial }, this.config.turnOnDebugMode as boolean)
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
      .addRequiredClusterServers()
      .addCommandHandler('on', (data) => {
        this.log.info(`Command on called on cluster ${data.cluster}`);
      })
      .addCommandHandler('off', (data) => {
        this.log.info(`Command off called on cluster ${data.cluster}`);
      })
      .addCommandHandler('step', (data) => {
        this.log.info(`Command step called on cluster ${data.cluster}`);
      })
      .addCommandHandler('changeToMode', (data) => {
        this.log.info(`Command changeToMode called on cluster ${data.cluster}`);
      });

    await this.registerDevice(fan);

    // TODO: Add checks what sensors are actually in the unit

    const aqs = new MatterbridgeEndpoint(airQualitySensor, { uniqueStorageKey: 'vallow-aqs-' + valloxInfo.serial }, this.config.turnOnDebugMode as boolean)
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
      .addClusterServers([TemperatureMeasurement.Cluster.id, RelativeHumidityMeasurement.Cluster.id, CarbonDioxideConcentrationMeasurement.Cluster.id])
      .addCommandHandler('on', (data) => {
        this.log.info(`Command on called on cluster ${data.cluster}`);
      })
      .addCommandHandler('off', (data) => {
        this.log.info(`Command off called on cluster ${data.cluster}`);
      });

    await this.registerDevice(aqs);
  }
}
