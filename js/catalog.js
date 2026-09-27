// The starter list: common jobs with typical intervals. They're typical, not rules. Manuals, vets,
// dentists and labels often say something else, and every one can be changed after it's added.
// Each: [key, name, rule, what to remember (the placeholder for that field)].

const every = (n, unit) => ({ kind: 'every', n, unit });
const seasons = (...list) => ({ kind: 'seasons', list });

export const CATALOG = [
  {
    area: 'House',
    note: 'Check the manual for anything with a filter or a warranty.',
    items: [
      ['furnace-filter', 'Change the furnace filter', every(90, 'day'), 'Size and rating, e.g. 16×25×1 MERV 8'],
      ['test-alarms', 'Test smoke and CO alarms', every(1, 'month'), 'Where each alarm is'],
      ['alarm-batteries', 'Replace alarm batteries', every(1, 'year'), 'Which battery each alarm takes'],
      ['replace-alarms', 'Replace smoke alarms', every(10, 'year'), 'Model, and the date on the back'],
      ['dryer-vent', 'Clean the dryer vent', every(1, 'year'), 'Where the vent comes out'],
      ['water-heater', 'Flush the water heater', every(1, 'year'), 'Where the drain valve is'],
      ['gutters', 'Clean the gutters', seasons('spring', 'fall'), 'Ladder length, trouble spots'],
      ['fridge-coils', 'Vacuum the fridge coils', every(6, 'month'), 'Front grille or back panel'],
      ['fridge-filter', 'Change the fridge water filter', every(6, 'month'), 'Filter model'],
      ['dishwasher-filter', 'Clean the dishwasher filter', every(1, 'month'), 'How it comes out'],
      ['range-hood', 'Clean the range hood filter', every(3, 'month'), 'How it comes out'],
      ['washer-clean', 'Run a washer cleaning cycle', every(1, 'month'), 'Which setting, what to add'],
      ['sump-pump', 'Test the sump pump', every(3, 'month'), 'Where the pump and outlet are'],
      ['gfci', 'Test GFCI outlets', every(1, 'month'), 'Which outlets have the buttons'],
      ['softener-salt', 'Top up the softener salt', every(6, 'week'), 'Kind of salt and how many bags'],
      ['extinguisher', 'Check the fire extinguisher', every(1, 'month'), 'Where it is, and its date'],
      ['furnace-service', 'Service the furnace', seasons('fall'), 'Who does it, and their number'],
      ['ac-service', 'Service the air conditioner', seasons('spring'), 'Who does it, and their number'],
      ['ceiling-fans', 'Switch the ceiling fan direction', seasons('spring', 'fall'), 'Counterclockwise in summer'],
      ['mattress', 'Rotate the mattress', every(3, 'month'), 'Which end was at the top'],
      ['chimney', 'Sweep the chimney', every(1, 'year'), 'Who does it, and their number'],
    ],
  },
  {
    area: 'Pets',
    note: 'Go by your vet for meds, doses and vaccines.',
    items: [
      ['flea-tick', 'Flea and tick treatment', every(1, 'month'), 'Product and dose for their weight'],
      ['heartworm', 'Heartworm pill', every(1, 'month'), 'Product and dose'],
      ['nails', 'Trim nails', every(4, 'week'), 'Which clippers, how far to cut'],
      ['vet-visit', 'Vet checkup', every(1, 'year'), 'Vet’s name and number'],
      ['vaccines', 'Vaccine boosters', every(1, 'year'), 'Which ones are due when'],
      ['deworm', 'Worming tablet', every(3, 'month'), 'Product and dose'],
      ['grooming', 'Grooming', every(6, 'week'), 'Groomer, and what to ask for'],
      ['fountain-filter', 'Change the water fountain filter', every(4, 'week'), 'Filter model'],
      ['pet-bed', 'Wash the pet bed', every(1, 'month'), 'Wash setting'],
      ['litter', 'Change all the litter', every(2, 'week'), 'Brand, how much'],
    ],
  },
  {
    area: 'Car',
    note: 'Your owner’s manual and the mileage may say sooner.',
    items: [
      ['oil-change', 'Oil change', every(6, 'month'), 'Oil type, how much, mileage for the next one'],
      ['tire-rotation', 'Rotate the tires', every(6, 'month'), 'Mileage at the last rotation'],
      ['tire-pressure', 'Check tire pressure', every(1, 'month'), 'Pressure on the door sticker, e.g. 35 psi'],
      ['wipers', 'Replace wiper blades', every(1, 'year'), 'Blade lengths, driver and passenger'],
      ['cabin-filter', 'Change the cabin air filter', every(1, 'year'), 'Part number'],
      ['engine-filter', 'Change the engine air filter', every(1, 'year'), 'Part number'],
      ['tire-swap', 'Swap winter and summer tires', seasons('spring', 'fall'), 'Where the other set is, lug nut torque'],
      ['registration', 'Renew the registration', every(1, 'year'), 'Plate number, where to renew'],
      ['wax', 'Wash and wax the car', every(3, 'month'), 'Which wax'],
    ],
  },
  {
    area: 'Workshop',
    note: 'How often depends on how much you use them.',
    items: [
      ['chisels', 'Sharpen chisels and plane irons', every(3, 'month'), 'Grits and angles'],
      ['saw-table', 'Wax the saw table', every(3, 'month'), 'Paste wax, no silicone'],
      ['dust-bag', 'Change the dust collector bag', every(3, 'month'), 'Bag size'],
      ['shop-vac', 'Change the shop vac filter', every(6, 'month'), 'Filter model'],
      ['saw-blades', 'Get saw blades sharpened', every(1, 'year'), 'Who does it'],
      ['respirator', 'Change respirator cartridges', every(6, 'month'), 'Cartridge type'],
      ['rust', 'Oil hand tools against rust', every(6, 'month'), 'Which oil'],
    ],
  },
  {
    area: 'Garden',
    note: 'Go by your local weather, not the calendar alone.',
    items: [
      ['mower-blade', 'Sharpen the mower blade', seasons('spring'), 'Blade part number'],
      ['mower-service', 'Service the mower', seasons('spring'), 'Oil, spark plug and filter parts'],
      ['feed-lawn', 'Feed the lawn', seasons('spring', 'fall'), 'Product and spreader setting'],
      ['aerate', 'Aerate the lawn', seasons('fall'), 'Where to rent the aerator'],
      ['outdoor-taps', 'Drain hoses and outdoor taps', seasons('fall'), 'Where the shut-off valves are'],
      ['garden-tools', 'Clean and oil garden tools', seasons('fall'), 'Which oil'],
      ['prune', 'Prune fruit trees', seasons('winter'), 'Which trees'],
      ['sprinklers', 'Test the sprinklers', seasons('spring'), 'Controller settings by zone'],
      ['bird-feeder', 'Clean the bird feeder', every(2, 'week'), 'Soak mix, e.g. 1 part bleach to 9 water'],
    ],
  },
  {
    area: 'Health',
    note: 'Your dentist, doctor or optometrist may say different.',
    items: [
      ['dentist', 'Dentist cleaning', every(6, 'month'), 'Dentist’s name and number'],
      ['toothbrush', 'New toothbrush head', every(3, 'month'), 'Which heads fit'],
      ['eye-exam', 'Eye exam', every(2, 'year'), 'Prescription'],
      ['contacts', 'New contact lenses', every(1, 'month'), 'Brand and prescription'],
      ['lens-case', 'New contact lens case', every(3, 'month'), ''],
      ['checkup', 'Checkup', every(1, 'year'), 'Doctor’s name and number'],
      ['flu-shot', 'Flu shot', seasons('fall'), 'Where you got it'],
      ['skin-check', 'Skin check', every(1, 'year'), 'Spots to watch'],
      ['first-aid', 'Restock the first-aid kit', every(1, 'year'), 'What ran out'],
      ['tetanus', 'Tetanus booster', every(10, 'year'), 'Which shot you had'],
      ['pillows', 'Wash the pillows', every(6, 'month'), 'Wash setting'],
    ],
  },
];

export const byKey = Object.fromEntries(CATALOG.flatMap(g => g.items.map(([key, name, rule, hint]) => [key, { key, name, rule, hint, area: g.area }])));
