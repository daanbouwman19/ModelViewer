const http = require('http');
const fs = require('fs');
const path = require('path');
const { startLocalServer, stopLocalServer, getServerPort, getMimeType } = require('../main/local-server');
const { SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_VIDEO_EXTENSIONS } = require('../main/constants');

const TEST_DIR = path.join(__dirname, 'local_server_test_files');
const TEST_IMAGE_FILE = path.join(TEST_DIR, 'test_image.png');
const TEST_VIDEO_FILE = path.join(TEST_DIR, 'test_video.mp4');
const TEST_UNKNOWN_FILE = path.join(TEST_DIR, 'test_file.unknown');

describe('local-server.js', () => {
    beforeAll(() => {
        // Create a directory for test files
        if (!fs.existsSync(TEST_DIR)) {
            fs.mkdirSync(TEST_DIR);
        }
        // Create dummy files for testing
        fs.writeFileSync(TEST_IMAGE_FILE, 'dummy image content');
        fs.writeFileSync(TEST_VIDEO_FILE, 'dummy video content');
        fs.writeFileSync(TEST_UNKNOWN_FILE, 'dummy unknown content');
    });

    afterAll(() => {
        // Clean up test files and directory
        fs.unlinkSync(TEST_IMAGE_FILE);
        fs.unlinkSync(TEST_VIDEO_FILE);
        fs.unlinkSync(TEST_UNKNOWN_FILE);
        fs.rmdirSync(TEST_DIR);
    });

    afterEach(done => {
        // Ensure server is stopped after each test
        stopLocalServer(done);
    });

    describe('getMimeType', () => {
        it('should return correct MIME type for supported image extensions', () => {
            expect(getMimeType('file.png')).toBe('image/png');
            expect(getMimeType('file.jpg')).toBe('image/jpeg');
            expect(getMimeType('file.jpeg')).toBe('image/jpeg');
            expect(getMimeType('file.gif')).toBe('image/gif');
            expect(getMimeType('file.webp')).toBe('image/webp');
            expect(getMimeType('file.svg')).toBe('image/svg');
        });

        it('should return correct MIME type for supported video extensions', () => {
            expect(getMimeType('file.mp4')).toBe('video/mp4');
            expect(getMimeType('file.webm')).toBe('video/webm');
            expect(getMimeType('file.ogg')).toBe('video/ogg');
            expect(getMimeType('file.mov')).toBe('video/quicktime');
            expect(getMimeType('file.avi')).toBe('video/x-msvideo');
            expect(getMimeType('file.mkv')).toBe('video/x-matroska');
        });

        it('should return application/octet-stream for unknown extensions', () => {
            expect(getMimeType('file.unknown')).toBe('application/octet-stream');
            expect(getMimeType('file.txt')).toBe('application/octet-stream');
        });

        it('should be case-insensitive for extensions', () => {
            expect(getMimeType('file.PNG')).toBe('image/png');
            expect(getMimeType('file.MP4')).toBe('video/mp4');
        });
    });

    describe('Server Start and Stop', () => {
        it('should start the server on a random available port and then stop it', (done) => {
            expect(getServerPort()).toBe(0); // Port should be 0 before start
            startLocalServer(() => {
                const port = getServerPort();
                expect(port).toBeGreaterThan(0);

                // Verify server is listening by making a request to a known test file
                const encodedFilePath = encodeURIComponent(TEST_IMAGE_FILE);
                http.get(`http://localhost:${port}/${encodedFilePath}`, (res) => {
                    expect(res.statusCode).toBe(200); // Expect OK if server is up and file is found
                    res.resume(); // Consume response data to free up memory
                    stopLocalServer(() => {
                        expect(getServerPort()).toBe(0); // Port should be 0 after stop
                        done();
                    });
                }).on('error', (err) => {
                    done(err); // Fail test if connection error
                });
            });
        });

        it('calling startLocalServer when already started should not start a new server', (done) => {
            startLocalServer(() => {
                const port1 = getServerPort();
                expect(port1).toBeGreaterThan(0);
                let onReadyCalledCount = 0;
                const onReadyCb = () => {
                    onReadyCalledCount++;
                    expect(getServerPort()).toBe(port1); // Port should be the same
                };
                startLocalServer(onReadyCb); // Call start again

                // Check after a short delay.
                // The callback should be called once for the second call.
                setTimeout(() => {
                    expect(onReadyCalledCount).toBe(1); // onReadyCallback for the second call
                    done();
                }, 200); // Increased delay slightly for reliability
            });
        });

        it('stopLocalServer should call callback even if server is not running', (done) => {
            stopLocalServer(() => {
                // This callback should be executed immediately
                expect(getServerPort()).toBe(0);
                done();
            });
        });
    });

    describe('File Serving', () => {
        let serverPort;

        beforeEach(done => {
            startLocalServer(() => {
                serverPort = getServerPort();
                done();
            });
        });

        it('should serve an image file with correct Content-Type and Content-Length', (done) => {
            const encodedFilePath = encodeURIComponent(TEST_IMAGE_FILE);
            http.get(`http://localhost:${serverPort}/${encodedFilePath}`, (res) => {
                expect(res.statusCode).toBe(200);
                expect(res.headers['content-type']).toBe(getMimeType(TEST_IMAGE_FILE));
                expect(res.headers['content-length']).toBe(String(fs.statSync(TEST_IMAGE_FILE).size));
                expect(res.headers['accept-ranges']).toBe('bytes');
                res.resume();
                done();
            }).on('error', done);
        });

        it('should serve a video file with correct Content-Type and Content-Length', (done) => {
            const encodedFilePath = encodeURIComponent(TEST_VIDEO_FILE);
            http.get(`http://localhost:${serverPort}/${encodedFilePath}`, (res) => {
                expect(res.statusCode).toBe(200);
                expect(res.headers['content-type']).toBe(getMimeType(TEST_VIDEO_FILE));
                expect(res.headers['content-length']).toBe(String(fs.statSync(TEST_VIDEO_FILE).size));
                expect(res.headers['accept-ranges']).toBe('bytes');
                res.resume();
                done();
            }).on('error', done);
        });

        it('should return 404 for a non-existent file', (done) => {
            const nonExistentFile = encodeURIComponent(path.join(TEST_DIR, 'non_existent_file.txt'));
            http.get(`http://localhost:${serverPort}/${nonExistentFile}`, (res) => {
                expect(res.statusCode).toBe(404);
                res.resume();
                done();
            }).on('error', done);
        });

        it('should handle range requests for a video file (206 Partial Content)', (done) => {
            const fileSize = fs.statSync(TEST_VIDEO_FILE).size;
            const rangeStart = 0;
            const rangeEnd = Math.min(10, fileSize - 1); // Request first 10 bytes, or less if file is smaller
            const expectedLength = rangeEnd - rangeStart + 1;

            const options = {
                hostname: 'localhost',
                port: serverPort,
                path: `/${encodeURIComponent(TEST_VIDEO_FILE)}`,
                headers: {
                    'Range': `bytes=${rangeStart}-${rangeEnd}`
                }
            };

            http.get(options, (res) => {
                expect(res.statusCode).toBe(206);
                expect(res.headers['content-type']).toBe(getMimeType(TEST_VIDEO_FILE));
                expect(res.headers['content-length']).toBe(String(expectedLength));
                expect(res.headers['content-range']).toBe(`bytes ${rangeStart}-${rangeEnd}/${fileSize}`);
                expect(res.headers['accept-ranges']).toBe('bytes');

                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    expect(data.length).toBe(expectedLength);
                    done();
                });
            }).on('error', done);
        });

        it('should return 416 for an invalid range request', (done) => {
            const fileSize = fs.statSync(TEST_VIDEO_FILE).size;
            const options = {
                hostname: 'localhost',
                port: serverPort,
                path: `/${encodeURIComponent(TEST_VIDEO_FILE)}`,
                headers: {
                    'Range': `bytes=${fileSize}-${fileSize + 100}` // Invalid range
                }
            };
            http.get(options, (res) => {
                expect(res.statusCode).toBe(416);
                expect(res.headers['content-range']).toBe(`bytes */${fileSize}`);
                res.resume();
                done();
            }).on('error', done);
        });

        it('should handle file paths with spaces', (done) => {
            const testFileWithSpace = path.join(TEST_DIR, 'test file with spaces.txt');
            fs.writeFileSync(testFileWithSpace, 'content of file with spaces');

            // Pathname in URL should be URI encoded, server decodes it
            const urlPath = `/${encodeURIComponent(testFileWithSpace)}`;

            http.get(`http://localhost:${serverPort}${urlPath}`, (res) => {
                expect(res.statusCode).toBe(200);
                expect(res.headers['content-type']).toBe(getMimeType(testFileWithSpace));
                expect(res.headers['content-length']).toBe(String(fs.statSync(testFileWithSpace).size));
                res.resume();
                fs.unlinkSync(testFileWithSpace); // Clean up
                done();
            }).on('error', (err) => {
                fs.unlinkSync(testFileWithSpace); // Clean up on error too
                done(err);
            });
        });
    });
});
