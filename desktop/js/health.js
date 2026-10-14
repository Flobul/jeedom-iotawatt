/* Rafraîchissement de la page Santé, sans modifier les réglages du plugin. */
(function () {
    var button = document.getElementById('bt_refreshHealth_iotawatt');
    if (!button) return;
    button.addEventListener('click', function () {
        var dialog = button.closest('.jeeDialog');
        jeeDialog.dialog({
            id: dialog && dialog.id ? dialog.id : 'jee_modal',
            title: '{{Santé IoTaWatt}}',
            contentUrl: 'index.php?v=d&plugin=iotawatt&modal=health'
        });
    });
})();
