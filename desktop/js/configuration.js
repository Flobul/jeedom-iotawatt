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
 * You should have received a copy of the GNU General Public License
 * along with Jeedom. If not, see <http://www.gnu.org/licenses/>.
 */

/* global version */

function addCondition(_expression, _idElementLinky) {
    jeedom.cmd.byHumanName({
        humanName: _expression,
        error: function (error) {
            jeedomUtils.showAlert({message: error.message, level: 'danger'});
        },
        success: function (data) {
            var html = data.isHistorized ? '<span class="label label-success">{{Commande historisée}}</span>' : '<span class="label label-danger">{{Commande non historisée}}</span>';
            document.getElementById(_idElementLinky).innerHTML = html;
        }
    });
}

document.querySelector('.configKey[data-l1key=linky]').addEventListener('change', function (event) {
    addCondition(document.querySelector('.configKey[data-l1key=linky]').value, 'infoCmdLinky');
});

document.querySelector('.configKey[data-l1key=powerLinky]').addEventListener('change', function (event) {
    addCondition(document.querySelector('.configKey[data-l1key=powerLinky]').value, 'infoCmdPowerLinky');
});

// afficher juste avant la version, la véritable version contenue dans le plugin
var dateVersionElem = document.getElementById('span_plugin_install_date');
if (dateVersionElem) {
    var dateVersion = dateVersionElem.innerHTML;
    dateVersionElem.innerHTML = 'v' + version + ' (' + dateVersion + ')';
}

var refreshBtn = document.querySelector('.bt_refreshPluginInfo');
if (refreshBtn) {
    var reviewBtn = document.createElement('a');
    reviewBtn.className = 'btn btn-success btn-sm';
    reviewBtn.target = '_blank';
    reviewBtn.href = 'https://market.jeedom.com/index.php?v=d&p=market_display&id=4099';
    reviewBtn.innerHTML = '<i class="fas fa-comment-dots "></i> Donner mon avis';
    refreshBtn.parentNode.insertBefore(reviewBtn, refreshBtn.nextSibling);
}

document.querySelector('.formIotawatt .cmdPowerLinky').addEventListener('click', function(event) {
    jeedom.cmd.getSelectModal({cmd: {type: 'info'}}, function (result) {
        document.querySelector('.configKey[data-l1key=powerLinky]').value = result.human;
        addCondition(result.human, 'infoCmdPowerLinky');
    });
});

document.querySelector('.formIotawatt .cmdLinky').addEventListener('click', function(event) {
    jeedom.cmd.getSelectModal({cmd: {type: 'info'}}, function (result) {
        document.querySelector('.configKey[data-l1key=linky]').value = result.human;
        addCondition(result.human, 'infoCmdLinky');
    });
});

// Gestion de l'affichage dynamique des champs tarifaires
function updateTariffFields() {
    var tariffType = document.querySelector('.configKey[data-l1key=tariffType]').value;

    // Masquer tous les champs tarifaires spécifiques
    document.querySelectorAll('.tariff-hphc, .tariff-hphc-prices, .tariff-tempo, .tariff-ejp, .tariff-base, .subscription-base, .subscription-hphc, .subscription-tempo, .subscription-ejp').forEach(function(el) {
        el.classList.add('hidden');
    });

    // Afficher les champs selon le type d'offre
    if (tariffType === 'base') {
        document.querySelectorAll('.tariff-base, .subscription-base').forEach(function(el) {
            el.classList.remove('hidden');
        });
    } else if (tariffType === 'hphc') {
        document.querySelectorAll('.tariff-hphc, .tariff-hphc-prices, .subscription-hphc').forEach(function(el) {
            el.classList.remove('hidden');
        });
    } else if (tariffType === 'tempo') {
        // Pour Tempo, on affiche les horaires ET les tarifs spécifiques (mais pas les prix HP/HC simples)
        document.querySelectorAll('.tariff-hphc, .tariff-tempo, .subscription-tempo').forEach(function(el) {
            el.classList.remove('hidden');
        });
    } else if (tariffType === 'ejp') {
        document.querySelectorAll('.tariff-ejp, .subscription-ejp').forEach(function(el) {
            el.classList.remove('hidden');
        });
    }
}

// Pré-remplir les champs tarifaires selon l'offre et la puissance
function updateTariffValues(forceUpdate) {
    var tariffType = document.querySelector('.configKey[data-l1key=tariffType]').value;
    var subscribedPower = document.querySelector('.configKey[data-l1key=subscribedPower]').value;

    // Valeurs officielles EDF Tarif Bleu (source: Grille tarifaire officielle)
    var defaultValues = {
        base: {
            3: { price: 0.1952, subscription: 11.73 },
            6: { price: 0.1952, subscription: 15.47 },
            9: { price: 0.1952, subscription: 19.39 },
            12: { price: 0.1952, subscription: 23.32 },
            15: { price: 0.1952, subscription: 27.06 },
            18: { price: 0.1952, subscription: 30.76 },
            24: { price: 0.1952, subscription: 38.79 },
            30: { price: 0.1952, subscription: 46.44 },
            36: { price: 0.1952, subscription: 54.29 }
        },
        hphc: {
            6: { hp: 0.2081, hc: 0.1635, subscription: 15.74 },
            9: { hp: 0.2081, hc: 0.1635, subscription: 19.81 },
            12: { hp: 0.2081, hc: 0.1635, subscription: 23.76 },
            15: { hp: 0.2081, hc: 0.1635, subscription: 27.49 },
            18: { hp: 0.2081, hc: 0.1635, subscription: 31.34 },
            24: { hp: 0.2081, hc: 0.1635, subscription: 39.47 },
            30: { hp: 0.2081, hc: 0.1635, subscription: 47.02 },
            36: { hp: 0.2081, hc: 0.1635, subscription: 54.61 }
        },
        tempo: {
            6: { hcBlue: 0.1232, hcWhite: 0.1391, hcRed: 0.1460, hpBlue: 0.1494, hpWhite: 0.1730, hpRed: 0.6468, subscription: 15.50 },
            9: { hcBlue: 0.1232, hcWhite: 0.1391, hcRed: 0.1460, hpBlue: 0.1494, hpWhite: 0.1730, hpRed: 0.6468, subscription: 19.49 },
            12: { hcBlue: 0.1232, hcWhite: 0.1391, hcRed: 0.1460, hpBlue: 0.1494, hpWhite: 0.1730, hpRed: 0.6468, subscription: 23.38 },
            15: { hcBlue: 0.1232, hcWhite: 0.1391, hcRed: 0.1460, hpBlue: 0.1494, hpWhite: 0.1730, hpRed: 0.6468, subscription: 27.01 },
            18: { hcBlue: 0.1232, hcWhite: 0.1391, hcRed: 0.1460, hpBlue: 0.1494, hpWhite: 0.1730, hpRed: 0.6468, subscription: 30.79 },
            24: { hcBlue: 0.1232, hcWhite: 0.1391, hcRed: 0.1460, hpBlue: 0.1494, hpWhite: 0.1730, hpRed: 0.6468, subscription: 46.31 },
            30: { hcBlue: 0.1232, hcWhite: 0.1391, hcRed: 0.1460, hpBlue: 0.1494, hpWhite: 0.1730, hpRed: 0.6468, subscription: 46.31 },
            36: { hcBlue: 0.1232, hcWhite: 0.1391, hcRed: 0.1460, hpBlue: 0.1494, hpWhite: 0.1730, hpRed: 0.6468, subscription: 54.43 }
        },
        ejp: {
            9: { normal: 0.1418, mobile: 1.0867, subscription: 19.32 },
            12: { normal: 0.1418, mobile: 1.0867, subscription: 23.04 },
            15: { normal: 0.1418, mobile: 1.0867, subscription: 26.81 },
            18: { normal: 0.1418, mobile: 1.0867, subscription: 30.47 },
            36: { normal: 0.1418, mobile: 1.0867, subscription: 53.32 }
        }
    };

    // Mettre à jour les champs selon les valeurs par défaut
    if (defaultValues[tariffType] && defaultValues[tariffType][subscribedPower]) {
        var values = defaultValues[tariffType][subscribedPower];

        if (tariffType === 'base') {
            setFieldValue('priceBase', values.price, forceUpdate);
            setFieldValue('subscriptionBase', values.subscription, forceUpdate);
        } else if (tariffType === 'hphc') {
            setFieldValue('priceHP', values.hp, forceUpdate);
            setFieldValue('priceHC', values.hc, forceUpdate);
            setFieldValue('subscriptionHPHC', values.subscription, forceUpdate);
        } else if (tariffType === 'tempo') {
            setFieldValue('priceTempoHCBlue', values.hcBlue, forceUpdate);
            setFieldValue('priceTempoHCWhite', values.hcWhite, forceUpdate);
            setFieldValue('priceTempoHCRed', values.hcRed, forceUpdate);
            setFieldValue('priceTempoHPBlue', values.hpBlue, forceUpdate);
            setFieldValue('priceTempoHPWhite', values.hpWhite, forceUpdate);
            setFieldValue('priceTempoHPRed', values.hpRed, forceUpdate);
            setFieldValue('subscriptionTempo', values.subscription, forceUpdate);
        } else if (tariffType === 'ejp') {
            setFieldValue('priceEJPNormal', values.normal, forceUpdate);
            setFieldValue('priceEJPMobile', values.mobile, forceUpdate);
            setFieldValue('subscriptionEJP', values.subscription, forceUpdate);
        }
    }
}

function setFieldValue(fieldName, value, forceUpdate) {
    var field = document.querySelector('.configKey[data-l1key="' + fieldName + '"]');
    if (field) {
        // Ne mettre à jour que si le champ est vide OU si forceUpdate est true
        if (!field.value || forceUpdate) {
            field.value = value;
            // Marquer visuellement que la valeur a été mise à jour
            field.classList.add('updated');
            setTimeout(function() {
                field.classList.remove('updated');
            }, 300);
        }
    }
}

// Écouter les changements du type d'offre
document.addEventListener('change', function(event) {
    if (event.target.matches('.configKey[data-l1key=tariffType]')) {
        updateTariffFields();
        updateTariffValues(true); // Forcer la mise à jour lors du changement d'offre
    }
    if (event.target.matches('.configKey[data-l1key=subscribedPower]')) {
        updateTariffValues(true); // Forcer la mise à jour lors du changement de puissance
    }
});

function printModiciationsOnPluginConfiguration() {
    var divPluginIotawattConfiguration = document.getElementById('configuration_plugin_iotawatt');
    var btnSavePluginConfig = document.getElementById('bt_savePluginConfig');
    var configInputs = divPluginIotawattConfiguration?.querySelectorAll('.configKey');
    var modificationCount = 0;
    var initialValues = new Map();
    var modificationMessage = document.createElement('i');
    modificationMessage.classList.add('modificationWithoutSave', 'label', 'label-warning', 'pull-right');
    modificationMessage.innerHTML = '{{Modification en cours...}}';
    modificationMessage.unseen();
    btnSavePluginConfig.parentNode.insertBefore(modificationMessage, btnSavePluginConfig.nextSibling);

    function resetStyle(element) {
        element.style.setProperty('background-color', '', 'important');
        element.style.setProperty('color', '', 'important');
    }

    function setModifiedStyle(element) {
        element.style.setProperty('background-color', 'var(--al-warning-color)', 'important');
        element.style.setProperty('color', 'var(--sc-lightTxt-color)', 'important');
    }

    function updateModificationStatus() {
        if (modificationCount > 0) {
            modificationMessage.seen();
        } else {
            modificationMessage.unseen();
        }
    }

    configInputs?.forEach(function (input) {
        resetStyle(input); // Reset du style au démarrage
        if (input.type === 'checkbox') {
            initialValues.set(input, input.checked);
        } else {
            initialValues.set(input, input.value);
        }
    });

    configInputs?.forEach(function (input) {
        if (input.type === 'checkbox') {
            input.addEventListener('change', function() {
                const initialValue = initialValues.get(this);
                const isModified = this.checked !== initialValue;

                if (isModified && !this.hasAttribute('data-modified')) {
                    setModifiedStyle(this);
                    this.setAttribute('data-modified', '');
                    modificationCount++;
                } else if (!isModified && this.hasAttribute('data-modified')) {
                    resetStyle(this);
                    this.removeAttribute('data-modified');
                    modificationCount--;
                }
                updateModificationStatus();
            });
        } else {
            const eventType = input.nodeName === 'SELECT' ? 'change' : 'input';
            input.addEventListener(eventType, function() {
                const initialValue = initialValues.get(this);
                const isModified = this.value !== initialValue;

                if (isModified && !this.hasAttribute('data-modified')) {
                    setModifiedStyle(this);
                    this.setAttribute('data-modified', '');
                    modificationCount++;
                } else if (!isModified && this.hasAttribute('data-modified')) {
                    resetStyle(this);
                    this.removeAttribute('data-modified');
                    modificationCount--;
                }
                updateModificationStatus();
            });
        }
    });

    btnSavePluginConfig.addEventListener('click', function() {
        configInputs.forEach(input => {
            if (input.type === 'checkbox') {
                initialValues.set(input, input.checked);
            } else {
                initialValues.set(input, input.value);
            }
            resetStyle(input);
            input.removeAttribute('data-modified');
        });
        modificationCount = 0;
        modificationMessage.unseen();
    });
}

// Initialiser l'affichage au chargement
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", printPluginConfiguration);
} else {
    setTimeout(function() {
        printPluginConfiguration();
    }, 200);
}

function printPluginConfiguration() {
    printModiciationsOnPluginConfiguration();
    updateTariffFields();
    updateTariffValues(false); // Ne pas forcer au chargement (respecter les valeurs existantes)
    
    // Gestionnaires pour les modèles rapides d'horaires HC (utiliser la délégation car les boutons sont dans un élément caché)
    document.querySelector('.tariff-hphc').addEventListener('click', function(event) {
        var target = event.target;
        
        // Vérifier si le clic est sur un bouton ou un de ses enfants (icône)
        if (target.id === 'applyHCTemplate1' || target.closest('#applyHCTemplate1')) {
            event.preventDefault();
            // Modèle: 22h-6h tous les jours
            var days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            days.forEach(function(day) {
                var field = document.querySelector('.configKey[data-l1key="hc' + day + '"]');
                if (field) {
                    field.value = '22:00-06:00';
                    // Déclencher l'événement input pour activer la détection de modification
                    field.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
            return;
        }
        
        if (target.id === 'applyHCTemplate2' || target.closest('#applyHCTemplate2')) {
            event.preventDefault();
            // Modèle: 22h-6h semaine, tout le week-end en HC
            var weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
            weekdays.forEach(function(day) {
                var field = document.querySelector('.configKey[data-l1key="hc' + day + '"]');
                if (field) {
                    field.value = '22:00-06:00';
                    // Déclencher l'événement input pour activer la détection de modification
                    field.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
            
            var weekend = ['Saturday', 'Sunday'];
            weekend.forEach(function(day) {
                var field = document.querySelector('.configKey[data-l1key="hc' + day + '"]');
                if (field) {
                    field.value = '00:00-24:00';
                    // Déclencher l'événement input pour activer la détection de modification
                    field.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
            return;
        }
        
        if (target.id === 'clearAllHC' || target.closest('#clearAllHC')) {
            event.preventDefault();
            var clearDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            clearDays.forEach(function(day) {
                var field = document.querySelector('.configKey[data-l1key="hc' + day + '"]');
                if (field) {
                    field.value = '';
                    // Déclencher l'événement input pour activer la détection de modification
                    field.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
            return;
        }
    });
}
