#!/usr/bin/env python3
import json
from pathlib import Path

PARSED = Path('/root/npm/data/aipharmagent.com/kg/parsed/anticoag-boite-a-outil.json')
OUT = Path('/root/npm/data/aipharmagent.com/kg/jsonld/anticoag-boite-a-outil.jsonld')


def chunk(payload, seq):
    return next(c for c in payload['chunks'] if c['sequence'] == seq)['text']


def quote(text, needle, length=520):
    idx = text.lower().find(needle.lower())
    if idx == -1:
        return text[:length]
    return text[idx: idx + length].replace('\n', ' ').strip()


def entity(eid, etype, name, source_page, source_quote, **kwargs):
    base = {
        '@id': f'urn:pharmagent:anticoag:{eid}',
        '@type': etype,
        'name': name,
        'sourceDocument': {'@id': 'urn:pharmagent:anticoag:doc'},
        'sourcePage': str(source_page),
        'sourceSection': kwargs.pop('sourceSection', ''),
        'sourceQuote': source_quote,
        'confidence': 0.82,
        'needsHumanReview': True,
        'reviewStatus': 'human_review',
        'publishStatus': 'ready_for_working_memory'
    }
    base.update(kwargs)
    return base


def main():
    payload = json.loads(PARSED.read_text(encoding='utf-8'))
    c15 = chunk(payload, 15)
    c16 = chunk(payload, 16)
    c26 = chunk(payload, 26)
    c28 = chunk(payload, 28)
    c29 = chunk(payload, 29)
    c31 = chunk(payload, 31)
    c34 = chunk(payload, 34)
    c35 = chunk(payload, 35)

    graph = [
        entity(
            'doc', 'pharm:ClinicalDocument', 'Boite a outils - ajustement anticoagulation', 'unknown',
            'Boîte à outils - ajustement de la warfarine Version - 9 septembre 2023',
            description='Document local sur ajustement de la warfarine, suivi du RNI et situations particulieres.'
        ),
        entity(
            'warfarine-initiation-suivi-rni', 'pharm:FollowUpProtocol', 'Initiation warfarine - frequence RNI', 'debut traitement',
            quote(c15, 'Généralement, en début de traitement'),
            sourceSection='Traitements',
            recommendation='En debut de traitement par warfarine, demander des RNI frequemment, typiquement 2 a 3 fois par semaine, puis espacer graduellement lorsque la dose se stabilise.',
            requiresMonitoring=['RNI', 'observance', 'signes de saignement', 'facteurs modifiant le RNI'],
            requiresFollowUp=['RNI quotidiennement, aux 2 jours ou maximum aux 3 jours selon contexte initial', 'ensuite q1 semaine x2, q2 semaines x2, puis q4 semaines lorsque stabilise'],
            followUpInterval='RNI 2-3 fois/semaine au debut; espacement graduel si stabilite'
        ),
        entity(
            'warfarine-dose-depart-age', 'pharm:DoseAdjustmentRule', 'Dose initiale warfarine selon age et risque', 'initiation',
            quote(c15 + ' ' + c16, '≤ 5 mg pour personnes âgées'),
            sourceSection='Traitements',
            recommendation='Utiliser une dose initiale prudente de warfarine: ≤ 5 mg chez personnes agees, denutries, haut risque de saignement, trouble hepatique, insuffisance cardiaque congestive ou interaction augmentant la warfarine; 5 mg pour les autres patients. Chez personnes agees, une dose plus faible de 2 a 3 mg peut etre preferee.',
            requiresMonitoring=['RNI', 'saignement', 'interactions', 'fonction hepatique', 'insuffisance cardiaque'],
            requiresFollowUp=['RNI selon protocole d initiation', 'ajuster selon facteurs modifiant le RNI'],
            followUpInterval='RNI aux 2-3 jours en ambulatoire jusqu a deux valeurs therapeutiques, puis hebdomadaire au premier mois'
        ),
        entity(
            'warfarine-dose-charge', 'pharm:DoseAdjustmentRule', 'Dose de charge warfarine', 'initiation',
            quote(c16, "L'utilisation de dose de charge"),
            sourceSection='Utilisation de dose de charge',
            recommendation='La dose de charge est souvent non necessaire; si utilisee, elle se limite generalement a 2 fois la dose d entretien estimee et ne doit pas depasser 10 mg.',
            requiresMonitoring=['RNI', 'risque de saignement'],
            requiresFollowUp=['RNI rapproche apres initiation ou dose de charge'],
            followUpInterval='RNI quotidiennement a aux 2-3 jours selon contexte'
        ),
        entity(
            'warfarine-suivi-annuel-fsc', 'pharm:MonitoringParameter', 'Suivi FSC annuel sous warfarine', 'suivi recommande',
            quote(c26, 'Une formule sanguine est obtenue'),
            sourceSection='Suivi recommande',
            recommendation='Obtenir une formule sanguine avant le debut du traitement, puis au moins une fois par annee afin de detecter des saignements occultes.',
            requiresMonitoring=['formule sanguine complete', 'saignements occultes'],
            requiresFollowUp=['FSC avant traitement puis au moins annuellement'],
            followUpInterval='annuel minimal apres valeur de base'
        ),
        entity(
            'warfarine-rni-stable', 'pharm:FollowUpProtocol', 'RNI stable - frequence de suivi', 'suivi recommande',
            quote(c28, 'RNI toutes les 4 semaines'),
            sourceSection='Frequence de suivis recommandes',
            recommendation='Lorsque le RNI est stable et habituellement dans l ecart therapeutique vise, mesurer le RNI toutes les 4 semaines; selon la condition clinique, un intervalle de 4 a 12 semaines peut etre envisage.',
            requiresMonitoring=['RNI', 'changements etat de sante', 'changements medication', 'changements diete'],
            requiresFollowUp=['RNI plus rapidement si changement de sante, medication ou diete'],
            followUpInterval='q4 semaines; parfois q4-12 semaines selon condition clinique'
        ),
        entity(
            'warfarine-facteur-persistant', 'pharm:DoseAdjustmentRule', 'RNI variable avec facteur persistant', 'ajustement',
            quote(c29, 'modifier immédiatement la dose hebdomadaire'),
            sourceSection='Ajustement',
            recommendation='Si aucun facteur temporaire n explique la variation du RNI, ou si un facteur detecte est susceptible de persister, modifier immediatement la dose hebdomadaire de warfarine.',
            requiresMonitoring=['RNI', 'facteur de variation', 'medication interagissante'],
            requiresFollowUp=['appliquer le pourcentage d ajustement recommande selon le tableau applicable', 'evaluer besoin d ajustement temporaire selon contexte clinique'],
            followUpInterval='selon prochain RNI recommande et contexte clinique'
        ),
        entity(
            'warfarine-hfpm-risque-eleve', 'pharm:FollowUpProtocol', 'RNI sous-therapeutique et HFPM', 'ajustement',
            quote(c31, 'risque thromboembolique élevé'),
            sourceSection='RNI sous-therapeutique et HFPM',
            recommendation='Chez les personnes a risque thromboembolique eleve, particulierement porteurs de valve mecanique ou antecedent d AVC, considerer une HFPM jusqu au retour du RNI dans l ecart therapeutique vise.',
            requiresMonitoring=['RNI', 'risque thromboembolique', 'risque de saignement'],
            requiresFollowUp=['RNI rapproche lors HFPM ou dose de charge importante'],
            followUpInterval='RNI plus rapproche que l intervalle maximal selon contexte'
        ),
        entity(
            'rni-supratherapeutique-3-5', 'pharm:DoseAdjustmentRule', 'RNI 3 a 5 sans saignement significatif', 'rni supratherapeutique',
            quote(c34, '3 à 5 Sans saignement significatif'),
            sourceSection='RNI supra-therapeutique',
            recommendation='Pour RNI 3 a 5 sans saignement significatif, aucune dose de vitamine K n est recommandee; suivre l ajustement de la dose de warfarine selon l algorithme applicable.',
            requiresMonitoring=['RNI', 'saignement significatif'],
            requiresFollowUp=['ajuster warfarine selon ecart therapeutique vise'],
            followUpInterval='selon algorithme et contexte clinique'
        ),
        entity(
            'rni-supratherapeutique-5-9', 'pharm:DoseAdjustmentRule', 'RNI 5 a 9 sans saignement significatif', 'rni supratherapeutique',
            quote(c34, '5 à 9 Sans saignement significatif'),
            sourceSection='RNI supra-therapeutique',
            recommendation='Pour RNI 5 a 9 sans saignement significatif, si une inversion rapide est requise, administrer vitamine K 1 a 2,5 mg PO; RNI et FSC dans 24 a 48 h.',
            requiresMonitoring=['RNI', 'FSC', 'saignement'],
            requiresFollowUp=['repeter vitamine K PRN selon RNI et contexte'],
            followUpInterval='24 a 48 h'
        ),
        entity(
            'saignements-significatifs', 'pharm:ReferralCriterion', 'Signes de saignements significatifs', 'saignements',
            quote(c35, 'Saignements significatifs'),
            sourceSection='Type de saignements',
            recommendation='Identifier comme significatifs les signes de saignement intra-abdominal, gastro-intestinal, intracerebral ou externe important et persistant.',
            hasReferralCriterion=['douleurs abdominales severes inexpliquees', 'sang rouge vif dans les selles', 'melena', 'vomissements brunatres', 'cephalees severes et soudaines', 'confusion', 'evanouissement', 'hematurie', 'hemoptysie'],
            requiresFollowUp=['reference urgente selon presentation clinique'],
            followUpInterval='immediat si signes significatifs'
        )
    ]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({'@context': '/kg/schema/pharmagent.context.jsonld', '@graph': graph}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(OUT)


if __name__ == '__main__':
    main()
