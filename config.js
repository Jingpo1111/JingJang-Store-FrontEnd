// Central configuration for the frontend API URL
const isLocal = window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.protocol === 'file:';

const CONFIG = {
    API_BASE: isLocal ? 'http://localhost:3000' : 'https://jingjangstore.com'
};
