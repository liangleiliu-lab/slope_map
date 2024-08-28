// serial.js
document.getElementById('connectButton').addEventListener('click', async () => {
    try {
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });

        const writer = port.writable.getWriter();
        const reader = port.readable.getReader();
        const decoder = new TextDecoderStream();
        const inputDone = port.readable.pipeTo(decoder.writable);
        const inputStream = decoder.readable;

        const readerStream = inputStream.getReader();

        // Send a command to read a file
        await writer.write(new TextEncoder().encode("READ:datalog.txt\n"));

        while (true) {
            const { value, done } = await readerStream.read();
            if (done) {
                break;
            }
            if (value) {
                console.log(value);
                // Send data to the backend
                await fetch('https://us-central1-slopemap-13158.cloudfunctions.net/uploadData', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ data: value })
                });
            }
        }

        reader.releaseLock();
        writer.releaseLock();
    } catch (error) {
        console.error('Error:', error);
    }
});