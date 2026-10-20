// English quest strings. Keys: quest.<id>.title / .summary / .<objectiveId>.
import { questStringsHarrowmark } from './strings.harrowmark.en';
import { questStringsDensityA } from './strings.density.en';
import { questStringsDensityB } from './strings.density-b.en';

export const questStrings: Record<string, string> = {
  ...questStringsHarrowmark,
  'quest.journal.title': 'Journal',
  'quest.lead.m03': 'Sister Aelfreda is asking for you at the chapel.',
  'quest.journal.empty': 'Your journal is empty. Kettlewick has stories waiting.',
  'quest.journal.active': 'Active',
  'quest.journal.completed': 'Completed',
  'quest.journal.failed': 'Failed',

  'quest.t03.title': 'A Warm Welcome',
  'quest.t03.summary': 'The lane to Kettlewick is quiet this morning. Greet the people who kept faith with you.',
  'quest.t03.o1': 'Greet Marshal Stane at the Practice Yard',
  'quest.t03.o2': 'Visit your mother at the bakery',
  'quest.t03.o3': 'Read the notice board',

  'quest.t12.title': 'Gear Up',
  'quest.t12.summary': 'Edda has set out what Sir Gaut left for you. Dress for the road and learn your journal.',
  'quest.t12.kit': 'Equip the sword and tabard, then drink a flask',
  'quest.t12.o1': 'Open your quest log',

  'quest.m01.title': 'Ash on the Wind',
  'quest.m01.summary': 'Ash wraiths drift through the lanes of Kettlewick. Drive them off, carry the frightened to the chapel, and tell Sir Gaut.',
  'quest.m01.o1': 'Drive off the ash wraiths',
  'quest.m01.o2': 'Carry villagers to the chapel door',
  'quest.m01.o3': 'Report to Sir Gaut',

  'quest.m02.title': "A Mother's Bread",
  'quest.m02.summary': 'The Brannoc hearth-stone still sits in the smoking bakery. Fetch it, and finally talk with your mother.',
  'quest.m02.o1': 'Go to the bakery',
  'quest.m02.o2': 'Take the hearth-stone from the hearth',
  'quest.m02.o3': 'Talk with Edda',

  'quest.m03.title': 'Cold Embers',
  'quest.m03.summary': 'The Heartshard is waking cold. Sister Aelfreda will teach you the Surge Leap, the cost of Burn and the rite of Release.',
  'quest.m03.o1': 'Hear Sister Aelfreda out at the chapel',
  'quest.m03.o2': 'Study the shard glow by the chapel',
  'quest.m03.o3': 'Learn the Surge Leap (V)',
  'quest.m03.o4': 'Leap across the chapel cliff',
  'quest.m03.o5': 'Learn the Release rite from Sister Aelfreda',
  'quest.m03.o6': 'Release or defeat the wraith in the churchyard',
  'quest.m03.o7': 'Report to Sister Aelfreda',

  'quest.m04.title': 'The Toll at Hollin Ford',
  'quest.m04.summary': 'The Regent\'s toll-post has closed Hollin Ford and stranded the carters. Meet Sir Gaut there, break the post and free them.',
  'quest.m04.o1': 'Go to the toll-post at Hollin Ford',
  'quest.m04.o2': 'Learn to Spare from Sir Gaut',
  'quest.m04.o3': 'Beat two blighted soldiers (Spare them if they yield)',
  'quest.m04.o4': 'Break the toll-post',
  'quest.m04.o5': 'Talk with the stranded carters',
  'quest.m04.o6': 'Report to Sir Gaut',

  'quest.m05.title': 'Wardstones for the Dead Road',
  'quest.m05.summary': 'Tobb knows a rhythm that keeps wraiths from crossing the Dead Road. Strike the wardstones, rekindle the shrine and bring a bard along.',
  'quest.m05.o1': 'Strike the wardstones along the Dead Road (gold marker)',
  'quest.m05.o2': 'Rekindle the Quenchstone Shrine',
  'quest.m05.o3': 'Talk with Tobb',

  'quest.d01.title': 'Prayers in the Vault',
  'quest.d01.summary': 'Something has been tolling in the vault beneath the chapel. Go down, face the Ashen Prior and tell Sister Aelfreda what you did.',
  'quest.d01.o1': 'Enter the chapel vault',
  'quest.d01.o2': 'Reach the vault arena',
  'quest.d01.o3': 'Face the Ashen Prior',
  'quest.d01.o4': 'Tell Sister Aelfreda',

  'quest.r01.title': 'Wynn\'s Scarecrows',
  'quest.r01.summary': 'Ash has possessed the scarecrows in Wynn\'s barley. A sword only knocks them down, so use fire or a purifying Surge.',
  'quest.r01.o1': 'Talk with Wynn Tillman',
  'quest.r01.o2': 'Clear the ash scarecrows',
  'quest.r01.o3': 'Tell Wynn',

  'quest.r02.title': 'The Marshal\'s Last Drill',
  'quest.r02.summary': 'Marshal Stane has three challenges for you on the blocking dummies in the Practice Yard.',
  'quest.r02.o1': 'Talk with Marshal Stane',
  'quest.r02.o2': 'Hit an open dummy three times',
  'quest.r02.o3': 'Parry three attacks',
  'quest.r02.o4': 'Break two guards',
  'quest.r02.o5': 'Report to Marshal Stane',
  // the density pass's lines last, so they replace the older ones
  ...questStringsDensityA,
  ...questStringsDensityB,
};
