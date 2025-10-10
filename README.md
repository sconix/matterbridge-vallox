# Matterbridge Vallox Plugin

Plugin for matterbridge to transform your Vallox ventilation unit into Matter device.

This plugin creates two Matter devices, one for fan control and one for air quality showing.

## Fan control device

### Controlling through fan mode

Allows controlling the fan speed through the following modes:

- Off: Turns off the ventilation
- Low: Turns on the AWAY ventilation mode
- Med: Turns on the HOME ventilation mode
- High: Turns on the BOOST ventilation mode

Note: BOOST mode will only be active for the time configured for the BOOST mode through Vallox setup.

### Controlling with the speed percentage

This activates the FIREPLACE ventilcation mode and sets the extract and supply fan speeds to the given speed.

Note: FIREPLACE mode will only be active for the time configured for the CUSTOM mode through Vallox setup.

## Air quality sensor

Air quality value is based on the CO2 measurement.

### Temperature value

Temperature value shows the current supply air temperature.

### Relative humidity

Relative humidity value shows the value of the humidity sensor.

### Carbon dioxide (CO2)

Carbon dioxide value shows the value of the carbon dioxide sensor.
