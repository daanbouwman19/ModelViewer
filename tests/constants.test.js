const {
    MAX_DATA_URL_SIZE_MB,
    FILE_INDEX_CACHE_KEY,
    SUPPORTED_IMAGE_EXTENSIONS,
    SUPPORTED_VIDEO_EXTENSIONS,
    ALL_SUPPORTED_EXTENSIONS
} = require('../main/constants');

describe('Constants', () => {
    test('MAX_DATA_URL_SIZE_MB should be a number', () => {
        expect(typeof MAX_DATA_URL_SIZE_MB).toBe('number');
    });

    test('FILE_INDEX_CACHE_KEY should be a string', () => {
        expect(typeof FILE_INDEX_CACHE_KEY).toBe('string');
    });

    test('SUPPORTED_IMAGE_EXTENSIONS should be an array of strings', () => {
        expect(Array.isArray(SUPPORTED_IMAGE_EXTENSIONS)).toBe(true);
        SUPPORTED_IMAGE_EXTENSIONS.forEach(ext => {
            expect(typeof ext).toBe('string');
            expect(ext.startsWith('.')).toBe(true);
        });
    });

    test('SUPPORTED_VIDEO_EXTENSIONS should be an array of strings', () => {
        expect(Array.isArray(SUPPORTED_VIDEO_EXTENSIONS)).toBe(true);
        SUPPORTED_VIDEO_EXTENSIONS.forEach(ext => {
            expect(typeof ext).toBe('string');
            expect(ext.startsWith('.')).toBe(true);
        });
    });

    test('ALL_SUPPORTED_EXTENSIONS should include all image and video extensions', () => {
        const expectedExtensions = [...SUPPORTED_IMAGE_EXTENSIONS, ...SUPPORTED_VIDEO_EXTENSIONS];
expect(ALL_SUPPORTED_EXTENSIONS.sort()).toEqual(expectedExtensions.sort());
    });

    test('Constants should not be undefined', () => {
        expect(MAX_DATA_URL_SIZE_MB).toBeDefined();
        expect(FILE_INDEX_CACHE_KEY).toBeDefined();
        expect(SUPPORTED_IMAGE_EXTENSIONS).toBeDefined();
        expect(SUPPORTED_VIDEO_EXTENSIONS).toBeDefined();
        expect(ALL_SUPPORTED_EXTENSIONS).toBeDefined();
    });
});
