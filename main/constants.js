const MAX_DATA_URL_SIZE_MB = 50; 
const FILE_INDEX_CACHE_KEY = 'file_index_json';
const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
const SUPPORTED_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
const ALL_SUPPORTED_EXTENSIONS = [...SUPPORTED_IMAGE_EXTENSIONS, ...SUPPORTED_VIDEO_EXTENSIONS];

module.exports = {
    MAX_DATA_URL_SIZE_MB,
    FILE_INDEX_CACHE_KEY,
    SUPPORTED_IMAGE_EXTENSIONS,
    SUPPORTED_VIDEO_EXTENSIONS,
    ALL_SUPPORTED_EXTENSIONS
};
