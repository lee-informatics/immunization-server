// Author: Preston Lee

import app from './app';

const port = 3001;
app.listen(port, () => {
    console.log('Immunization server is now listening on port ' + port + '. Yay.');
});
