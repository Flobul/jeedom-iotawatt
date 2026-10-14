/* This file is part of Jeedom.
 *
 * Jeedom is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Jeedom is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * Jeedom is received a copy of the GNU General Public License
 * along with Jeedom. If not, see <http://www.gnu.org/licenses/>.
 */

/* global addCmdToTable, modifyWithoutSave */

document.getElementById('bt_cmdCreateSave').addEventListener('click', function() {
    var series = document.getElementById('series_id').value;
    var voltpower = document.getElementById('voltPower').value;
    var roundValue = document.getElementById('roundValue').value;
    var selectedOption = document.querySelector('#series_id option:checked');
    var type = selectedOption ? selectedOption.dataset.type : '';
    var channel = selectedOption ? selectedOption.dataset.channel : '';

    const units = {
      Volts: "{{V}}",
      Hz: "{{Hz}}",
      Watts: "{{W}}",
      Amps: "{{A}}",
      Wh: "{{Wh}}",
      VA: "{{VA}}",
      VAR: "{{VAr}}",
      VARh: "{{VAhr}}",
      PF: "%"
    };
    const units_name = {
      Volts: "{{Tension}}",
      Hz: "{{Fréquence}}",
      Watts: "{{Puissance}}",
      Amps: "{{Intensité}}",
      Wh: "{{Consommation}}",
      VA: "{{Puissance active}}",
      VAR: "{{Puissance réactive}}",
      VARh: "{{Énergie réactive}}",
      PF: "{{Facteur de puissance}}"
    }

    if(series == '' || voltpower == '' || roundValue == ''){
        jeedomUtils.showAlert({message: '{{Veuillez sélectionnez une série, un type de valeur et l\'arrondi}}', level: 'danger'});
    } else {
        var cmdData = {
            name: units_name[voltpower] + ' ' + series,
            type: 'info',
            subType: 'numeric',
            logicalId: type + '_' + channel + '_' + units[voltpower],
            isVisible: 1,
            isHistorized: 1,
            unite: units[voltpower] || '',
            configuration: {
                "type": type,
                "channel": channel,
                "serie": series,
                "valueType": voltpower,
                "round": roundValue
            }
        };
        addCmdToTable(cmdData);
        modifyWithoutSave = true;
        // Fermer le modal - géré automatiquement par jeeDialog
        jeedomUtils.showAlert({message: '{{Commande créée avec succès ! Cliquez sur Sauvegarder pour enregistrer la commande.}}', level: 'success'});
    }
});