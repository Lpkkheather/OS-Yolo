
export type Point = { t: number; inside: number | null };

export type OccupancyData = {
  today: Point[];
  yesterday: Point[];

};


const today: (number | null)[] =   [
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 1, 1, 2, 2, 5, 9, 10,
    12, 17, 20, 20, 23, 28, 29, 29,
    31, 34, 33, 34, 38, 42, 44, 48,
    53, 54, 51, 49, 46, 38, 30, 26,
    22, 17, 16, 19, 21, null, null, null,
    null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null,
  ];

const yesterday: (number | null)[] =   [
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 1, 1, 2, 2, 4, 5, 9,
    12, 13, 14, 18, 20, 20, 22, 25,
    25, 25, 27, 30, 30, 31, 36, 40,
    40, 41, 43, 40, 35, 31, 27, 20,
    15, 14, 14, 13, 15, 20, 23, 24,
    28, 32, 32, 32, 35, 36, 34, 33,
    34, 31, 26, 22, 20, 15, 10, 9,
    9, 5, 4, 5, 2, 1, 1, 1,
    0, 0, 0, 0, 0, 0, 0, 0,
  ];


const toPoints = (a: (number | null)[]): Point[] =>
  a.map((inside, i) => ({ t: i * 15, inside }));

export const MOCK_STATIC: OccupancyData = {
  today: toPoints(today),
  yesterday: toPoints(yesterday),
};