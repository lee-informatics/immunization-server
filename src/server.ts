// Author: Preston Lee

import api from './api';

const port = 3000;
api.listen(port, () => {
    console.log('Immunization server is now listening on port ' + port + '. Yay.');
});
